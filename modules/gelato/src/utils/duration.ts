import { ErrorException, Num } from "@evmcrispr/sdk";

/** Parse a duration option (duration literals like `1h` arrive in seconds). */
export function parseDuration(value: unknown, name: string): bigint {
  let seconds: bigint;
  try {
    seconds = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `${name} must be a duration like 5m, 1h or 2d, got ${value}`,
    );
  }
  if (seconds <= 0n) {
    throw new ErrorException(`${name} must be greater than zero`);
  }
  return seconds;
}

/** Parse a plain positive amount. */
export function parseAmount(value: unknown, name = "<amount>"): bigint {
  let amount: bigint;
  try {
    amount = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(`${name} must be a number, got ${value}`);
  }
  if (amount <= 0n) {
    throw new ErrorException(`${name} must be greater than zero`);
  }
  return amount;
}
