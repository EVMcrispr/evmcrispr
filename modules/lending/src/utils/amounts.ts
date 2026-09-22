import type { Module } from "@evmcrispr/sdk";
import { ErrorException, Num } from "@evmcrispr/sdk";
import {
  isRuntimeValue,
  positiveRuntimeAmount,
  type SmartAmount,
} from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { zeroAddress } from "viem";

/**
 * Parse an amount arg declared as ["command", "number"]: the bareword `max`
 * arrives as the raw string, anything else must interpret as a positive
 * number.
 */
export function parseAmountOrMax(
  value: unknown,
  module?: Module,
): SmartAmount | "max" {
  if (isRuntimeValue(value)) {
    if (!module)
      throw new ErrorException("runtime amount requires a compilation context");
    return positiveRuntimeAmount(module, value);
  }
  if (value === "max") return "max";
  let amount: bigint;
  try {
    amount = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `<amount> must be a number or the keyword \`max\`, got ${value}`,
    );
  }
  if (amount <= 0n) {
    throw new ErrorException("<amount> must be greater than zero");
  }
  return amount;
}

/** Parse a plain amount arg into a positive bigint. */
export function parseAmount(value: unknown, module?: Module): SmartAmount {
  if (isRuntimeValue(value)) {
    if (!module)
      throw new ErrorException("runtime amount requires a compilation context");
    return positiveRuntimeAmount(module, value);
  }
  const amount = Num(value as string).toBigInt();
  if (amount <= 0n) {
    throw new ErrorException("<amount> must be greater than zero");
  }
  return amount;
}

/** Lending pools take the wrapped token; the native token has no reserve. */
export function rejectNative(token: Address): void {
  if (token === zeroAddress) {
    throw new ErrorException(
      "lending markets take the wrapped token (WETH, WXDAI...); wrap the native token first with swaps:wrap",
    );
  }
}

/** Case-insensitive address equality. */
export function sameAddress(a?: unknown, b?: unknown): boolean {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase()
  );
}
