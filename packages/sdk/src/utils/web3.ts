import type { Parser } from "arcsecond";
import {
  char,
  choice,
  coroutine,
  endOfInput,
  many,
  recursiveParser,
  regex,
} from "arcsecond";
import type { AbiFunction, AbiParameter } from "viem";
import { parseAbiItem } from "viem";
import type { ArgType } from "./schema";

export const isFunctionSignature = (signature: string) => {
  try {
    const bare = signature.startsWith("function ")
      ? signature.slice(9)
      : signature;
    parseAbiItem(`function ${bare} external`);
    if (bare.includes(",)")) {
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
};

/** Matches a balanced parenthesised group, including nested parens (tuples). */
export const balancedParens: Parser<string, string, any> = recursiveParser(() =>
  coroutine((run) => {
    run(char("("));
    const parts: string[] = run(
      many(choice([balancedParens, regex(/^[^()]+/)])),
    );
    run(char(")"));
    return `(${parts.join("")})`;
  }),
);

/** Parses a full read-abi signature: `name(inputs)(outputs)`. */
const readAbiSigParser = coroutine(
  (run: any): { body: string; returns: string } => {
    const name: string = run(regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*/));
    const inputs: string = run(balancedParens);
    const outputs: string = run(balancedParens);
    run(endOfInput);
    return {
      body: name + inputs,
      returns: outputs,
    };
  },
);

/**
 * Split a read-abi signature like `balanceOf(address)(uint256)` into its
 * constituent parts.  Handles nested tuples correctly.
 */
export function splitReadAbiSignature(
  sig: string,
): { body: string; returns: string } | undefined {
  const result = readAbiSigParser.run(sig);
  if (result.isError) return undefined;
  return result.result;
}

export function isReadAbiSignature(value: string): boolean {
  const parts = splitReadAbiSignature(value);
  if (!parts) return false;
  return isFunctionSignature(parts.body);
}

/** Reconstruct a Solidity type string from an AbiParameter, handling tuples. */
function formatAbiParamType(param: AbiParameter): string {
  if (param.type === "tuple" && "components" in param && param.components) {
    const inner = param.components.map(formatAbiParamType).join(",");
    return `(${inner})`;
  }
  if (
    param.type.startsWith("tuple[") &&
    "components" in param &&
    param.components
  ) {
    const inner = param.components.map(formatAbiParamType).join(",");
    const arraySuffix = param.type.slice("tuple".length);
    return `(${inner})${arraySuffix}`;
  }
  return param.type;
}

/** Format an AbiFunction as a read-abi string: `balanceOf(address)(uint256)`. */
export function toReadAbiSignature(func: AbiFunction): string {
  const inputs = func.inputs.map(formatAbiParamType).join(",");
  const outputs = func.outputs.map(formatAbiParamType).join(",");
  return `${func.name}(${inputs})(${outputs})`;
}

/** Map a Solidity type string to the nearest ArgType for completions. */
function solidityTypeToArgType(solType: string): ArgType {
  if (solType.endsWith("[]") || solType.startsWith("(")) return "array";
  if (solType === "bool") return "bool";
  if (solType === "address") return "address";
  if (solType === "string") return "string";
  if (solType === "bytes32") return "bytes32";
  if (/^bytes\d*$/.test(solType)) return "bytes";
  if (/^u?int\d*$/.test(solType)) return "number";
  return "any";
}

/** Extract parameter types from a function signature string like `transfer(address,uint256)`.
 *  Handles nested tuples via viem's parseAbiItem. */
export function parseSignatureParamTypes(sig: string): ArgType[] {
  try {
    const bare = sig.startsWith("function ") ? sig.slice(9) : sig;
    const item = parseAbiItem(`function ${bare} external`) as AbiFunction;
    return item.inputs.map((p) => solidityTypeToArgType(formatAbiParamType(p)));
  } catch {
    return [];
  }
}

/**
 * Extract input parameter types from a read-abi signature like
 * `balanceOf(address)(uint256)`, correctly handling nested tuples.
 */
export function parseReadAbiParamTypes(sig: string): ArgType[] {
  const parts = splitReadAbiSignature(sig);
  if (!parts) return parseSignatureParamTypes(sig);
  return parseSignatureParamTypes(parts.body);
}
