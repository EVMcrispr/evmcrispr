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

/** Map a Solidity type string to the nearest ArgType for completions. */
export function solidityTypeToArgType(solType: string): ArgType {
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
