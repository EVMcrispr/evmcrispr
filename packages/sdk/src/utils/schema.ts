import { isAddress } from "viem";

import { ErrorException } from "../errors";
import type { Binding, CompletionContext, CompletionItem } from "../types";
import { BindingsSpace } from "../types";
import { isNumberish } from "./args";

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
  "any",
  "literal",
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
      if (typeof value !== "bigint" && !isNumberish(value)) {
        throw new ErrorException(`${name} must be a number, got ${value}`);
      }
      break;
    case "string":
      if (typeof value !== "string" && typeof value !== "bigint") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
      break;
    case "bytes":
      if (typeof value !== "string" || !value.startsWith("0x")) {
        throw new ErrorException(`${name} must be a hex string, got ${value}`);
      }
      break;
    case "bytes32":
      if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new ErrorException(
          `${name} must be a bytes32 hex string, got ${value}`,
        );
      }
      break;
    case "bool":
      if (typeof value !== "boolean") {
        throw new ErrorException(`${name} must be a boolean, got ${value}`);
      }
      break;
    case "any":
    case "literal":
    case "variable":
    case "block":
      break;
  }
}

/**
 * Resolve completions for a given arg type. Used by the completion engine as
 * the default when no command-level override is provided.
 */
export function completionsForType(
  type: ArgType,
  ctx: CompletionContext,
  customTypes?: CustomArgTypes,
): CompletionItem[] | Promise<CompletionItem[]> {
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
          if (typeof v === "bigint") return true;
          if (typeof v === "string") return isNumberish(v);
          // Unresolved AST node: accept NumberLiteral
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
