import type { AbiItem } from "viem";
import { isAddressEqual, parseAbiItem } from "viem";

import type { Address } from "../types";

export const isFunctionSignature = (signature: string) => {
  try {
    parseAbiItem(`function ${signature} external`);
    return true;
  } catch (error) {
    return false;
  }
};

export const toDecimals = (amount: number | string, decimals = 18): bigint => {
  const [integer, decimal] = String(amount).split(".");
  return BigInt(
    (integer !== "0" ? integer : "") + (decimal || "").padEnd(decimals, "0") ||
      "0",
  );
};

export function addressesEqual(first: Address, second: Address): boolean {
  return isAddressEqual(first, second);
}

export function getFunctionFragment(func: AbiItem | undefined) {
  if (func?.type === "function") {
    return `function ${func.name}(${func.inputs.map((input) => input.type).join(", ")})${func.outputs.length > 0 ? ` returns (${func.outputs.map((output) => output.type).join(", ")})` : ""}`;
  }
  throw new Error("invalid function");
}
