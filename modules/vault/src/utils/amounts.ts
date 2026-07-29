import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { zeroAddress } from "viem";

/**
 * Parse an amount arg declared as ["command", "number"]: the bareword `max`
 * arrives as the raw string, anything else must interpret as a positive
 * number.
 */
export function parseAmountOrMax(value: unknown): bigint | "max" {
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
export function parseAmount(value: unknown): bigint {
  const amount = Num(value as string).toBigInt();
  if (amount <= 0n) {
    throw new ErrorException("<amount> must be greater than zero");
  }
  return amount;
}

/** ERC-4626 vaults hold ERC-20 assets; the native token has no vault. */
export function rejectNative(vault: Address): void {
  if (vault === zeroAddress) {
    throw new ErrorException(
      "ERC-4626 vaults hold ERC-20 assets; the native token has no vault. Wrap it first with swaps:wrap (WETH, WXDAI...)",
    );
  }
}
