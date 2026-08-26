/**
 * EVML entries arrays — `[[name value] [name value]]` — are the native way
 * to spell a keyed record in a script. Both the Web3 Function user-args
 * schema (`--user-args [[vault string] [threshold number]]`) and the values
 * passed to a task (`--args [[vault 0x…] [threshold 100]]`) use them.
 */
import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { encodeAbiParameters } from "viem";

/** Gelato's web3function.schema.json userArgs value types. */
export const USER_ARG_TYPES = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "boolean[]",
] as const;
export type UserArgType = (typeof USER_ARG_TYPES)[number];
export type UserArgsSchema = Record<string, UserArgType>;

/** Split an entries array into unique `[name, value]` pairs. */
export function parseEntries(
  value: unknown,
  label: string,
): [string, unknown][] {
  if (!Array.isArray(value)) {
    throw new ErrorException(
      `${label} must be an entries array like [[name value] [name value]]`,
    );
  }
  const seen = new Set<string>();
  const entries: [string, unknown][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new ErrorException(
        `${label} entries must be [name value] pairs, got ${JSON.stringify(entry)}`,
      );
    }
    const [name, item] = entry;
    if (typeof name !== "string" || !/^[\w-]+$/.test(name)) {
      throw new ErrorException(
        `${label} names must be identifiers (letters, digits, _ or -), got ${name}`,
      );
    }
    if (seen.has(name)) {
      throw new ErrorException(`${label} has a duplicate entry "${name}"`);
    }
    seen.add(name);
    entries.push([name, item]);
  }
  return entries;
}

/** `[[vault string] [threshold number]]` → `{ vault: "string", … }`. */
export function parseUserArgsSchema(
  value: unknown,
  label: string,
): UserArgsSchema {
  const schema: UserArgsSchema = {};
  for (const [name, type] of parseEntries(value, label)) {
    if (!USER_ARG_TYPES.includes(type as UserArgType)) {
      throw new ErrorException(
        `${label}: "${name}" has type ${JSON.stringify(type)} — expected one of ${USER_ARG_TYPES.join(", ")}`,
      );
    }
    schema[name] = type as UserArgType;
  }
  return schema;
}

function toUint(value: unknown, name: string): bigint {
  let n: bigint;
  try {
    n = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `user arg "${name}" must be a number, got ${value}`,
    );
  }
  if (n < 0n) {
    throw new ErrorException(`user arg "${name}" must not be negative`);
  }
  return n;
}

function toBool(value: unknown, name: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ErrorException(
    `user arg "${name}" must be true or false, got ${value}`,
  );
}

function toStr(value: unknown, name: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  try {
    return Num(value as string).toString();
  } catch {
    throw new ErrorException(
      `user arg "${name}" must be a string, got ${value}`,
    );
  }
}

function coerce(type: UserArgType, value: unknown, name: string): unknown {
  if (type.endsWith("[]")) {
    if (!Array.isArray(value)) {
      throw new ErrorException(`user arg "${name}" must be an array (${type})`);
    }
    const inner = type.slice(0, -2) as UserArgType;
    return value.map((v) => coerce(inner, v, name));
  }
  switch (type) {
    case "number":
      return toUint(value, name);
    case "boolean":
      return toBool(value, name);
    default:
      return toStr(value, name);
  }
}

const ABI_TYPES: Record<UserArgType, string> = {
  string: "string",
  number: "uint256",
  boolean: "bool",
  "string[]": "string[]",
  "number[]": "uint256[]",
  "boolean[]": "bool[]",
};

/**
 * ABI-encode task user args the way Gelato's automate-sdk does: values in
 * the schema's key order, `number` as uint256, `boolean` as bool, arrays
 * likewise. Every schema key must be given and no extra keys are allowed.
 */
export function encodeUserArgs(
  schema: UserArgsSchema,
  values: [string, unknown][],
): { hex: Hex; json: Record<string, unknown> } {
  const given = new Map(values);
  const keys = Object.keys(schema);
  for (const name of given.keys()) {
    if (!(name in schema)) {
      throw new ErrorException(
        `unknown user arg "${name}" — the function declares ${keys.length ? keys.join(", ") : "no user args"}`,
      );
    }
  }
  const missing = keys.filter((k) => !given.has(k));
  if (missing.length) {
    throw new ErrorException(
      `missing user arg${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
    );
  }
  const coerced = keys.map((k) => coerce(schema[k], given.get(k), k));
  const hex =
    keys.length === 0
      ? "0x"
      : encodeAbiParameters(
          keys.map((k) => ({ type: ABI_TYPES[schema[k]] })),
          coerced,
        );
  const json: Record<string, unknown> = {};
  keys.forEach((k, i) => {
    const v = coerced[i];
    json[k] = typeof v === "bigint" ? v.toString() : v;
  });
  return { hex, json };
}
