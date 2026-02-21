import type { Parser } from "arcsecond";
import {
  char,
  choice,
  coroutine,
  endOfInput,
  many,
  possibly,
  recursiveParser,
  regex,
  sequenceOf,
} from "arcsecond";
import type { AbiFunction, AbiParameter } from "viem";
import { parseAbiItem } from "viem";
import type { ArgType } from "./schema";

export const isFunctionSignature = (signature: string) => {
  try {
    parseAbiItem(`function ${signature} external`);
    if (signature.includes(",)")) {
      // Viem does not catch fn(a,) as invalid
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
};

/** Matches a balanced parenthesised group, including nested parens (tuples). */
const balancedParens: Parser<string, string, any> = recursiveParser(() =>
  coroutine((run) => {
    run(char("("));
    const parts: string[] = run(
      many(choice([balancedParens, regex(/^[^()]+/)])),
    );
    run(char(")"));
    return `(${parts.join("")})`;
  }),
);

/** Parses a full read-abi signature: `name(inputs)(outputs)` with optional `:index`. */
const readAbiSigParser = coroutine(
  (run: any): { body: string; returns: string; index?: string } => {
    const name: string = run(regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*/));
    const inputs: string = run(balancedParens);
    const outputs: string = run(balancedParens);
    const indexPart: [string, string] | null = run(
      possibly(sequenceOf([char(":"), regex(/^\d+/)])),
    );
    run(endOfInput);
    return {
      body: name + inputs,
      returns: outputs,
      index: indexPart ? indexPart[1] : undefined,
    };
  },
);

/**
 * Split a read-abi signature like `balanceOf(address)(uint256)` into its
 * constituent parts.  Handles nested tuples correctly.
 */
export function splitReadAbiSignature(
  sig: string,
): { body: string; returns: string; index?: string } | undefined {
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
  if (solType === "bool") return "bool";
  if (solType === "address") return "address";
  if (solType === "string") return "string";
  if (solType === "bytes32") return "bytes32";
  if (/^bytes\d*$/.test(solType)) return "bytes";
  if (/^u?int\d*$/.test(solType)) return "number";
  return "any";
}

/** Extract parameter types from a function signature string like `transfer(address,uint256)`. */
export function parseSignatureParamTypes(sig: string): ArgType[] {
  const match = sig.match(/\(([^)]*)\)/);
  if (!match) return [];
  const inner = match[1].trim();
  if (!inner) return [];
  return inner.split(",").map((s) => solidityTypeToArgType(s.trim()));
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
