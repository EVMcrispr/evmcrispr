import type { AbiFunction } from "viem";
import { isAddress, toFunctionSignature, toHex } from "viem";

import { ErrorException } from "../errors";
import type { Binding, CompletionContext, CompletionItem } from "../types";
import { BindingsSpace } from "../types";
import { abiBindingKey, fetchAbi } from "./abis";
import { isBoolean, isHexString, isNum, isString } from "./args";
import { Num } from "./Num";
import {
  isFunctionSignature,
  isReadAbiSignature,
  parseReadAbiParamTypes,
  parseSignatureParamTypes,
  toReadAbiSignature,
} from "./web3";

export interface CustomArgType {
  validate?(argName: string, value: any): void;
  /** Default completions for arguments of this type. */
  completions?(
    ctx: CompletionContext,
  ): Promise<CompletionItem[]> | CompletionItem[];
  /** Resolve an argument of this type and return bindings to add to the
   *  completion context. Called for commands before the cursor. */
  resolve?(rawValue: string, ctx: CompletionContext): Promise<Binding[]>;
}

export type CustomArgTypes = Record<string, CustomArgType>;

export type ArgType = string | string[];

const BUILTIN_TYPES = new Set<string>([
  "address",
  "array",
  "record",
  "number",
  "string",
  "bytes",
  "bytes32",
  "bool",
  "write-abi",
  "read-abi",
  "any",
  "variable",
  "block",
  "helper",
  "command",
  "expression",
]);

export function isBuiltinType(type: ArgType): boolean {
  if (Array.isArray(type)) return type.every((t) => BUILTIN_TYPES.has(t));
  return BUILTIN_TYPES.has(type);
}

export interface ArgDef {
  name: string;
  type: ArgType;
  optional?: boolean;
  rest?: boolean;
  /** Only fillable by name (`name:value`), never positionally. Implies
   *  optional; skipped by positional cursors and arity counting. */
  namedOnly?: boolean;
  /** Human-readable description for documentation. */
  description?: string;
  /** Allow a `variable`-typed arg to bind a config variable (`$mod:key`).
   *  Only `set` declares this — config vars are set-only everywhere else. */
  allowConfig?: boolean;
}

/**
 * Scan backward from `restIndex` to find a `write-abi` or `read-abi` arg
 * whose signature should drive type resolution for the rest params.
 */
export function findAbiArgForRest(
  argDefs: readonly { type: ArgType }[],
  restIndex: number,
): { sigIndex: number; isReadAbi: boolean } | undefined {
  for (let i = restIndex - 1; i >= 0; i--) {
    const t = argDefs[i].type;
    if (t === "write-abi") return { sigIndex: i, isReadAbi: false };
    if (t === "read-abi") return { sigIndex: i, isReadAbi: true };
  }
  return undefined;
}

/**
 * Build a runtime type resolver for a rest arg that follows an ABI-typed arg.
 * Returns `undefined` when no ABI arg precedes the rest arg.
 */
export function buildRuntimeResolver(
  argDefs: ArgDef[],
  restIndex: number,
): ((parsedArgs: Record<string, any>, i: number) => ArgType) | undefined {
  const found = findAbiArgForRest(argDefs, restIndex);
  if (!found) return undefined;
  const sigName = argDefs[found.sigIndex].name;
  const parser = found.isReadAbi
    ? parseReadAbiParamTypes
    : parseSignatureParamTypes;
  return (parsedArgs, i) => {
    const sig = parsedArgs[sigName];
    if (!sig) return "any";
    return parser(sig)[i] ?? "any";
  };
}

export interface OptDef {
  name: string;
  type: ArgType;
  /** Human-readable description for documentation. */
  description?: string;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
}

/**
 * Declared module configuration variable, addressed as `$<module>:<name>`.
 * Written only with `set`; read by the owning module via `getConfigBinding`.
 * Declarations live in a module's `src/configs.ts` and must stay literal-only
 * (docs generation parses them straight from source).
 */
export interface ConfigDef {
  /** Key without the module prefix, e.g. `tokenlist`. Letters/digits only. */
  name: string;
  /** Builtin ArgType tag used to validate `set` values. */
  type: ArgType;
  /** Human-readable description for completions, hover and docs. */
  description: string;
  /** Default when unset. May contain a `{chainId}` placeholder. */
  default?: string;
}

/**
 * Coerce integer values (Num or bigint) passed where `bytes32` is expected
 * into a left-padded 32-byte hex string, mirroring Solidity's
 * `bytes32(uint256(...))` cast. Negative integers wrap two's-complement.
 * Anything else — including short hex strings, whose padding direction is
 * ambiguous — passes through unchanged for `validateArgType` to judge.
 */
export function coerceArgType(value: any, type: ArgType): any {
  if (type !== "bytes32") return value;
  let big: bigint;
  if (value instanceof Num) {
    if (!value.isInteger()) return value;
    big = value.toBigInt();
  } else if (typeof value === "bigint") {
    big = value;
  } else {
    return value;
  }
  return toHex(BigInt.asUintN(256, big), { size: 32 });
}

/**
 * A record is an entries array: every element is a `[name, value]` pair
 * with a string-ish name. `[a:1 b:2]` desugars to this shape, but a
 * hand-written `[[a 1] [b 2]]` satisfies it equally — records have no
 * runtime identity beyond their shape.
 */
export function isRecordValue(value: any): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        (isString(entry[0]) || isNum(entry[0])),
    )
  );
}

export function validateArgType(
  name: string,
  value: any,
  type: ArgType,
  customTypes?: CustomArgTypes,
): void {
  if (Array.isArray(type)) {
    const errors: string[] = [];
    for (const t of type) {
      try {
        validateArgType(name, value, t, customTypes);
        return;
      } catch (e: any) {
        errors.push(e.message);
      }
    }
    throw new ErrorException(
      `${name} must be one of [${type.join(", ")}], got ${value}`,
    );
  }

  if (!isBuiltinType(type)) {
    customTypes?.[type]?.validate?.(name, value);
    return;
  }

  switch (type) {
    case "address":
      if (!isAddress(value)) {
        throw new ErrorException(
          `${name} must be a valid address, got ${value}`,
        );
      }
      break;
    case "array":
      if (!Array.isArray(value)) {
        throw new ErrorException(`${name} must be an array, got ${value}`);
      }
      break;
    case "record":
      if (!isRecordValue(value)) {
        throw new ErrorException(
          `${name} must be a record like [a:1 b:2] (entries of [name value] pairs), got ${value}`,
        );
      }
      break;
    case "number":
      if (!isNum(value)) {
        throw new ErrorException(`${name} must be a number, got ${value}`);
      }
      break;
    case "string":
      if (!isString(value) && !isNum(value)) {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
      break;
    case "bytes":
      if (!isHexString(value)) {
        throw new ErrorException(`${name} must be a hex string, got ${value}`);
      }
      break;
    case "bytes32":
      if (!isHexString(value) || value.length !== 66) {
        throw new ErrorException(
          `${name} must be a bytes32 hex string, got ${value}`,
        );
      }
      break;
    case "bool":
      if (!isBoolean(value)) {
        throw new ErrorException(`${name} must be a boolean, got ${value}`);
      }
      break;
    case "write-abi":
      if (!isFunctionSignature(value)) {
        throw new ErrorException(
          `${name} must be a valid function signature, got ${value}`,
        );
      }
      break;
    case "read-abi":
      if (!isReadAbiSignature(value)) {
        throw new ErrorException(
          `${name} must be a valid read-abi signature like fn(uint256)(bool), got ${value}`,
        );
      }
      break;
    case "any":
    case "variable":
    case "block":
    case "helper":
    case "command":
    case "expression":
      break;
  }
}

/**
 * Resolve completions for a given arg type. Used by the completion engine as
 * the default when no command-level override is provided.
 */
export async function completionsForType(
  type: ArgType,
  ctx: CompletionContext,
  customTypes?: CustomArgTypes,
): Promise<CompletionItem[]> {
  if (Array.isArray(type)) {
    const seen = new Set<string>();
    const results: CompletionItem[] = [];
    for (const t of type) {
      for (const item of await completionsForType(t, ctx, customTypes)) {
        if (!seen.has(item.label)) {
          seen.add(item.label);
          results.push(item);
        }
      }
    }
    return results;
  }

  switch (type) {
    case "address":
      return ctx.bindings
        .getAllBindings({ spaceFilters: [BindingsSpace.USER] })
        .filter(
          (b) => typeof b.value === "string" && isAddress(b.value as string),
        )
        .map((b) => variableItem(b.identifier));
    case "number":
      return ctx.bindings
        .getAllBindings({ spaceFilters: [BindingsSpace.USER] })
        .filter((b) => {
          const v = b.value;
          if (
            v instanceof Num ||
            typeof v === "bigint" ||
            typeof v === "string"
          )
            return isNum(v);
          if (v && typeof v === "object" && "type" in v) {
            return (v as { type: string }).type === "NumberLiteral";
          }
          return false;
        })
        .map((b) => variableItem(b.identifier));
    case "array":
      return [];
    case "bool":
      return [fieldItem("true"), fieldItem("false")];
    case "block":
      return [
        {
          label: "( ... )",
          insertText: "(\n\t$0\n)",
          kind: "field",
          sortPriority: 0,
          isSnippet: true,
        },
      ];
    case "write-abi":
    case "read-abi": {
      const targetNode = ctx.nodeArgs[ctx.argIndex - 1];
      if (!targetNode || !ctx.resolveNode) return [];
      const targetAddress = await ctx.resolveNode(targetNode);
      if (!targetAddress || !isAddress(targetAddress)) return [];

      const { ABI } = BindingsSpace;
      const key = abiBindingKey(ctx.chainId, targetAddress);
      let abi = ctx.bindings.getBindingValue(key, ABI);
      if (!abi) abi = ctx.cache.getBindingValue(key, ABI);
      if (!abi) {
        try {
          const [, fetchedAbi, fetchedChainId] = await fetchAbi(
            targetAddress,
            ctx.client,
          );
          ctx.cache.setBinding(
            abiBindingKey(fetchedChainId, targetAddress),
            fetchedAbi,
            ABI,
            false,
            undefined,
            true,
          );
          abi = fetchedAbi;
        } catch {
          return [];
        }
      }

      const isRead = type === "read-abi";
      return abi
        .filter(
          (item): item is AbiFunction =>
            item.type === "function" &&
            (isRead
              ? item.stateMutability === "view" ||
                item.stateMutability === "pure"
              : item.stateMutability === "nonpayable" ||
                item.stateMutability === "payable"),
        )
        .map((func: AbiFunction) =>
          isRead ? toReadAbiSignature(func) : toFunctionSignature(func),
        )
        .map(fieldItem);
    }
    case "variable":
      return ctx.bindings
        .getAllBindingIdentifiers({ spaceFilters: [BindingsSpace.USER] })
        .map((name: string) => variableItem(name));
    case "helper":
    case "command":
    case "expression":
      return [];
    default:
      if (!isBuiltinType(type)) {
        const customType = customTypes?.[type];
        if (customType?.completions) {
          return customType.completions(ctx);
        }
      }
      return [];
  }
}

/** Create a field CompletionItem from a string. */
export function fieldItem(s: string): CompletionItem {
  return {
    label: isAddress(s) ? `${s.slice(0, 6)}..${s.slice(-4)}` : s,
    insertText: s,
    kind: "field",
    sortPriority: 1,
  };
}

/** Create a variable CompletionItem from a string. */
export function variableItem(s: string): CompletionItem {
  return {
    label: s,
    insertText: s,
    kind: "variable",
    sortPriority: 2,
  };
}
