import { ErrorException, Num } from "@evmcrispr/sdk";

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

/** Parse `--tip` (a percentage, 0-100) into the tip amount for `amount`. */
export function tipAmount(amount: bigint, tip: unknown): bigint {
  const percent = Number(tip);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new ErrorException("--tip must be a percentage between 0 and 100");
  }
  return (amount * BigInt(Math.round(percent * 100))) / 10000n;
}
