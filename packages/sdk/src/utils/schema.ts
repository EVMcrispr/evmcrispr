import type { AbiFunction } from "viem";
import { isAddress, toFunctionSignature } from "viem";

import { ErrorException } from "../errors";
import type { Binding, CompletionContext, CompletionItem } from "../types";
import { BindingsSpace } from "../types";
import { abiBindingKey, fetchAbi } from "./abis";
import { isBoolean, isHexString, isNum, isString } from "./args";
import { interpretNodeSync } from "./ast";
import { Num } from "./Num";
import { isFunctionSignature } from "./web3";

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

export type ArgType = string;

const BUILTIN_TYPES = new Set<string>([
  "address",
  "number",
  "string",
  "bytes",
  "bytes32",
  "bool",
  "signature",
  "any",
  "variable",
  "block",
]);

export function isBuiltinType(type: string): boolean {
  return BUILTIN_TYPES.has(type);
}

export interface ArgDef {
  name: string;
  type: ArgType;
  optional?: boolean;
  rest?: boolean;
  /** Dynamically resolve the effective type at completion time. */
  resolveType?: (ctx: CompletionContext) => ArgType;
  /** For rest args: resolve effective type from the function signature in
   *  the arg at this index (e.g. `1` means use `nodeArgs[1].value`).
   *  Declarative alternative to `resolveType`. */
  signatureArgIndex?: number;
}

export interface OptDef {
  name: string;
  type: ArgType;
}

export function validateArgType(
  name: string,
  value: any,
  type: ArgType,
  customTypes?: CustomArgTypes,
): void {
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
    case "signature":
      if (!isFunctionSignature(value)) {
        throw new ErrorException(
          `${name} must be a valid function signature, got ${value}`,
        );
      }
      break;
    case "any":
    case "variable":
    case "block":
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
    case "signature": {
      const targetNode = ctx.nodeArgs[ctx.argIndex - 1];
      if (!targetNode) return [];
      const targetAddress = interpretNodeSync(targetNode, ctx.bindings);
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

      return abi
        .filter(
          (item): item is AbiFunction =>
            item.type === "function" &&
            (item.stateMutability === "nonpayable" ||
              item.stateMutability === "payable"),
        )
        .map((func: AbiFunction) => toFunctionSignature(func))
        .map(fieldItem);
    }
    case "variable":
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
