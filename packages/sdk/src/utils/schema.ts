import { isAddress } from "viem";

import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type { Node } from "../types";
import { BindingsSpace } from "../types";
import { isNumberish } from "./args";

export interface CustomArgType {
  validate?(argName: string, value: any): void;
  completions?(
    bindingsManager: BindingsManager,
    nodeArgs: Node[],
    argIndex: number,
  ): string[];
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

export function defaultCompletionsFromSchema(argDefs: ArgDef[]) {
  return (
    argIndex: number,
    nodeArgs: Node[],
    bindingsManager: BindingsManager,
  ): string[] => {
    const def =
      argDefs[argIndex] ?? (argDefs.at(-1)?.rest ? argDefs.at(-1) : undefined);
    if (!def) return [];

    if (def.type === "address") {
      return bindingsManager.getAllBindingIdentifiers({
        spaceFilters: [BindingsSpace.ADDR],
      });
    }

    if (!isBuiltinType(def.type)) {
      const scopeModule = bindingsManager.getScopeModule() ?? "std";
      const moduleData = bindingsManager.getBindingValue(
        scopeModule,
        BindingsSpace.MODULE,
      );
      const customType = moduleData?.types?.[def.type];
      return (
        customType?.completions?.(bindingsManager, nodeArgs, argIndex) ?? []
      );
    }

    return [];
  };
}
