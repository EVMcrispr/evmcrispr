import type { AbiError } from "abitype";
import type { Hex } from "viem";
import { encodeErrorResult, getAddress, isAddress } from "viem";

import { DeclaredError, ErrorException } from "../errors";
import type {
  DeclaredAbiType,
  DeclaredErrorField,
  DeclaredErrorFieldValue,
  DeclaredErrors,
  DeclaredFieldType,
  FailFn,
  NormalizedDeclaredError,
  NormalizedDeclaredErrors,
} from "../types";
import type {
  DeclaredErrorEntry,
  DeclaredErrorOwnerKind,
} from "./error-signatures";
import { errorSelector } from "./error-signatures";
import { Num } from "./Num";

/** Solidity's built-in errors; a module may not shadow them. */
const RESERVED_ERROR_NAMES = new Set(["Error", "Panic"]);

/** By convention a declared error reads like a Solidity custom error. */
const ERROR_NAME_RE = /^[A-Z][A-Za-z0-9_]*$/;
/** An ABI identifier, as accepted for a parameter name. */
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const FIELD_ABI_TYPES: Record<DeclaredFieldType, DeclaredAbiType> = {
  number: "uint256",
  address: "address",
  string: "string",
  bool: "bool",
  bytes32: "bytes32",
};

const FIELD_TYPES = Object.keys(FIELD_ABI_TYPES) as DeclaredFieldType[];

const ERROR_PROPS = ["description", "fields"];
const FIELD_PROPS = ["name", "type", "description"];

const UINT256_LIMIT = 1n << 256n;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

/** How many links of a `cause` chain a declared-error walk covers: the one
 *  bound shared by the SDK's extractors, the interpreter's capture matching
 *  and the worker boundary's serializer. */
export const MAX_CAUSE_DEPTH = 16;

/** Blocks normalized by {@link normalizeDeclaredErrors}, so re-normalizing
 *  an already validated (and frozen) block is free and stays idempotent. */
const normalizedBlocks = new WeakSet<object>();

/** The ABI type a declared field encodes as. */
export function declaredAbiType(type: DeclaredFieldType): DeclaredAbiType {
  return FIELD_ABI_TYPES[type];
}

/** The ABI error item a declaration derives, e.g.
 *  `error BelowMinimum(uint256 minimum)`. */
export function declaredErrorAbi(
  errorName: string,
  def: NormalizedDeclaredError,
): AbiError {
  return {
    type: "error",
    name: errorName,
    inputs: def.fields.map((f) => ({
      name: f.name,
      type: declaredAbiType(f.type),
    })),
  };
}

/**
 * Turn a definition's normalized declarations into capture-resolver
 * entries, tagged with the definition they came from.
 *
 * `errors` is what `defineCommand` / `defineHelper` store on the
 * definition (`command.errors`, `helper.errors`); a hand-built definition
 * has none, which yields no entries.
 */
export function declaredErrorEntries(
  ownerKind: DeclaredErrorOwnerKind,
  ownerLabel: string,
  errors: NormalizedDeclaredErrors | undefined,
): DeclaredErrorEntry[] {
  if (!errors) return [];
  return Object.keys(errors).map((name) => ({
    name,
    abi: declaredErrorAbi(name, errors[name]),
    description: errors[name].description,
    ownerKind,
    ownerLabel,
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldList(): string {
  return FIELD_TYPES.join(", ");
}

/** Quote an untrusted value for an error message. `JSON.stringify` throws
 *  on a bigint and returns undefined for undefined, so neither reaches it. */
function show(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "object" || typeof value === "string") {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeField(
  errorName: string,
  index: number,
  raw: unknown,
  fail: (msg: string) => never,
): DeclaredErrorField {
  const at = `declared error "${errorName}": field #${index}`;
  if (!isPlainObject(raw)) fail(`${at} must be an object`);

  for (const prop of Object.keys(raw)) {
    if (!FIELD_PROPS.includes(prop)) {
      fail(
        `${at} has an unknown property "${prop}" (expected ${FIELD_PROPS.join(", ")})`,
      );
    }
  }

  const { name, type, description } = raw;
  if (typeof name !== "string" || !FIELD_NAME_RE.test(name)) {
    fail(`${at} has an invalid field name ${show(name)}`);
  }
  const named = `declared error "${errorName}": field "${name}"`;
  if (typeof type !== "string" || !FIELD_TYPES.includes(type as never)) {
    fail(
      `${named} has an unsupported type ${show(type)} (expected ${fieldList()})`,
    );
  }
  if (description !== undefined && typeof description !== "string") {
    fail(`${named} has a non-string description`);
  }

  const field: DeclaredErrorField = {
    name,
    type: type as DeclaredFieldType,
    ...(description !== undefined ? { description } : {}),
  };
  return Object.freeze(field);
}

function normalizeError(
  errorName: string,
  raw: unknown,
  fail: (msg: string) => never,
): NormalizedDeclaredError {
  if (!ERROR_NAME_RE.test(errorName)) {
    fail(
      `invalid declared error name ${show(errorName)}: names must match ${ERROR_NAME_RE}`,
    );
  }
  if (RESERVED_ERROR_NAMES.has(errorName)) {
    fail(
      `declared error "${errorName}" is reserved for Solidity's built-in errors`,
    );
  }
  if (!isPlainObject(raw)) {
    fail(`declared error "${errorName}" must be an object`);
  }

  for (const prop of Object.keys(raw)) {
    if (!ERROR_PROPS.includes(prop)) {
      fail(
        `declared error "${errorName}" has an unknown property "${prop}" (expected ${ERROR_PROPS.join(", ")})`,
      );
    }
  }

  const { description, fields } = raw;
  if (typeof description !== "string" || description.trim() === "") {
    fail(`declared error "${errorName}" needs a non-empty description`);
  }
  if (fields !== undefined && !Array.isArray(fields)) {
    fail(`declared error "${errorName}": fields must be an array`);
  }

  const normalizedFields: DeclaredErrorField[] = [];
  const seen = new Set<string>();
  for (const [index, raw_] of ((fields ?? []) as unknown[]).entries()) {
    const field = normalizeField(errorName, index, raw_, fail);
    if (seen.has(field.name)) {
      fail(
        `declared error "${errorName}": duplicate field name "${field.name}"`,
      );
    }
    seen.add(field.name);
    normalizedFields.push(field);
  }

  return Object.freeze({
    description,
    fields: Object.freeze(normalizedFields),
  });
}

/**
 * Validate an `errors` block and return a deeply frozen normalized copy:
 * every error gains an explicit (possibly empty) field list, and nothing
 * else survives. Idempotent, so a shared `defineErrors({...})` spread into
 * a definition yields exactly the metadata an inline declaration would.
 *
 * @param label how to name the definition in error messages, e.g.
 *   `command "swaps:twap"`.
 */
export function normalizeDeclaredErrors(
  errors: DeclaredErrors | undefined,
  label?: string,
): NormalizedDeclaredErrors | undefined {
  if (errors === undefined) return undefined;

  // A function declaration, so TypeScript narrows on its `never` return.
  function fail(msg: string): never {
    throw new ErrorException(label ? `${label}: ${msg}` : msg);
  }

  if (!isPlainObject(errors)) fail("errors must be an object");
  if (normalizedBlocks.has(errors)) return errors as NormalizedDeclaredErrors;

  const normalized: Record<string, NormalizedDeclaredError> = {};
  for (const [errorName, raw] of Object.entries(errors)) {
    normalized[errorName] = normalizeError(errorName, raw, fail);
  }

  const frozen = Object.freeze(normalized);
  normalizedBlocks.add(frozen);
  return frozen;
}

/**
 * Share error definitions between commands or helpers: the result is
 * validated and frozen once, and spreads into an `errors` block.
 */
export function defineErrors<const E extends DeclaredErrors>(errors: E): E {
  return normalizeDeclaredErrors(errors) as unknown as E;
}

function toUint256(value: unknown, reject: (msg: string) => never): bigint {
  let n: bigint;
  if (typeof value === "bigint") {
    n = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      reject(
        `must be a uint256, got the JS number ${value} (pass a bigint for values outside the safe integer range)`,
      );
    }
    n = BigInt(value);
  } else if (value instanceof Num) {
    if (!value.isInteger()) {
      reject(`must be a whole number, got ${value.toFractionString()}`);
    }
    n = value.num;
  } else {
    reject(
      `must be a uint256 given as a bigint, a safe integer or an integral Num, got ${typeof value}`,
    );
  }
  if (n < 0n || n >= UINT256_LIMIT) {
    reject(`must be a uint256 (0 <= value < 2**256), got ${n}`);
  }
  return n;
}

function toFieldValue(
  field: DeclaredErrorField,
  value: unknown,
  reject: (msg: string) => never,
): DeclaredErrorFieldValue {
  switch (field.type) {
    case "number":
      return toUint256(value, reject);
    case "address":
      if (typeof value !== "string" || !isAddress(value, { strict: false })) {
        reject(`must be an address, got ${show(value)}`);
      }
      return getAddress(value);
    case "bytes32":
      if (typeof value !== "string" || !BYTES32_RE.test(value)) {
        reject(`must be 32 hex-encoded bytes, got ${show(value)}`);
      }
      return value;
    case "bool":
      if (typeof value !== "boolean") {
        reject(`must be a boolean, got ${show(value)}`);
      }
      return value;
    case "string":
      if (typeof value !== "string") {
        reject(`must be a string, got ${typeof value}`);
      }
      return value;
  }
}

/**
 * Validate the fields a raise site passes against a declaration and return
 * a frozen, ABI-ready copy: exactly the declared names, `number` fields
 * converted to bigint. Values are never stringified into shape.
 */
export function normalizeDeclaredErrorFields(
  errorName: string,
  def: NormalizedDeclaredError,
  fields: unknown,
  label?: string,
): Readonly<Record<string, DeclaredErrorFieldValue>> {
  const at = label
    ? `${label}: declared error "${errorName}"`
    : `declared error "${errorName}"`;
  // A function declaration, so TypeScript narrows on its `never` return.
  function fail(msg: string): never {
    throw new ErrorException(`${at}: ${msg}`);
  }

  if (def.fields.length === 0) {
    if (fields === undefined) return Object.freeze({});
    if (!isPlainObject(fields)) fail("declares no fields; pass {} or nothing");
    if (Object.keys(fields).length > 0) {
      fail(
        `declares no fields, got ${Object.keys(fields)
          .map((k) => `"${k}"`)
          .join(", ")}`,
      );
    }
    return Object.freeze({});
  }

  if (!isPlainObject(fields)) {
    fail(
      `needs its fields as an object (${def.fields.map((f) => f.name).join(", ")})`,
    );
  }

  const normalized: Record<string, DeclaredErrorFieldValue> = {};
  for (const field of def.fields) {
    if (!Object.hasOwn(fields, field.name)) {
      fail(`missing field "${field.name}"`);
    }
    normalized[field.name] = toFieldValue(field, fields[field.name], (msg) =>
      fail(`field "${field.name}" ${msg}`),
    );
  }
  for (const key of Object.keys(fields)) {
    if (!def.fields.some((f) => f.name === key)) {
      fail(`unexpected field "${key}"`);
    }
  }

  return Object.freeze(normalized);
}

/** ABI-encode a declared error's normalized fields as custom error data. */
export function encodeDeclaredError(
  errorName: string,
  def: NormalizedDeclaredError,
  fields: Readonly<Record<string, DeclaredErrorFieldValue>>,
): Hex {
  const abi = declaredErrorAbi(errorName, def);
  if (abi.inputs.length === 0) return errorSelector(abi);
  return encodeErrorResult({
    abi: [abi],
    errorName,
    args: def.fields.map((f) => fields[f.name]),
  });
}

/**
 * Build the `fail` of a run context for one definition's `errors` block.
 * The returned function always throws a {@link DeclaredError}.
 */
export function createFail<E extends DeclaredErrors>(
  errors: E | undefined,
  label?: string,
): FailFn<E> {
  const declared = normalizeDeclaredErrors(errors, label);
  const at = label ? `${label}: ` : "";

  return ((errorName: string, second?: unknown, third?: unknown): never => {
    if (!declared || Object.keys(declared).length === 0) {
      throw new ErrorException(
        `${at}cannot raise "${errorName}": this definition declares no errors`,
      );
    }
    const def = declared[errorName];
    if (!def || !Object.hasOwn(declared, errorName)) {
      throw new ErrorException(
        `${at}unknown declared error ${show(errorName)} (declared: ${Object.keys(
          declared,
        ).join(", ")})`,
      );
    }

    const twoArg = typeof second === "string" && third === undefined;
    const rawFields = twoArg ? undefined : second;
    const message = twoArg ? second : third;
    if (typeof message !== "string" || message.trim() === "") {
      throw new ErrorException(
        `${at}declared error "${errorName}" needs a non-empty raise-site message`,
      );
    }

    const fields = normalizeDeclaredErrorFields(
      errorName,
      def,
      rawFields,
      label,
    );
    throw new DeclaredError(
      errorName,
      message,
      fields,
      encodeDeclaredError(errorName, def, fields),
    );
  }) as FailFn<E>;
}

/**
 * The first {@link DeclaredError} in an error's `cause` chain, if any.
 * Helper failures reach a command wrapped in `HelperFunctionError`, so the
 * declared refusal can be several hops down. The walk is depth-bounded and
 * cycle-guarded: a malformed chain must not hang the interpreter.
 */
export function findDeclaredError(error: unknown): DeclaredError | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth++) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    if (current instanceof DeclaredError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
