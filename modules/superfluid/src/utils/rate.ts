import { ErrorException, Num } from "@evmcrispr/sdk";

/** Largest int96 value — CFA/GDA flow rates are int96 wei/second. */
export const INT96_MAX = 2n ** 95n - 1n;

function toRate(value: unknown, name: string): bigint {
  let rate: bigint;
  try {
    // Rate literals like `1000e18/mo` arrive as exact rationals; flooring
    // to wei/second happens only here, at encode time.
    rate = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `${name} must be a flow rate in wei per second — use a rate literal like 1000e18/mo, got ${value}`,
    );
  }
  if (rate > INT96_MAX) {
    throw new ErrorException(`${name} exceeds the maximum flow rate (int96)`);
  }
  return rate;
}

/** Parse a strictly positive flow rate; `1/y`-style dust that floors to 0 is rejected. */
export function parseFlowRate(value: unknown, name = "<rate>"): bigint {
  const rate = toRate(value, name);
  if (rate <= 0n) {
    throw new ErrorException(
      `${name} must be greater than zero — a tiny rate like 1/y floors to 0 wei/second`,
    );
  }
  return rate;
}

/** Parse a flow rate where `0` is meaningful (stop a distribution flow). */
export function parseFlowRateOrZero(value: unknown, name = "<rate>"): bigint {
  const rate = toRate(value, name);
  if (rate < 0n) {
    throw new ErrorException(`${name} must not be negative`);
  }
  return rate;
}

/** Parse a plain amount arg into a positive bigint. */
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

/** Parse a duration/period arg (duration literals arrive in seconds). */
export function parseDuration(value: unknown, name = "<duration>"): bigint {
  let seconds: bigint;
  try {
    seconds = Num(value as string).toBigInt();
  } catch {
    throw new ErrorException(
      `${name} must be a duration like 30d or 1y, got ${value}`,
    );
  }
  if (seconds <= 0n) {
    throw new ErrorException(`${name} must be greater than zero`);
  }
  if (seconds > 2n ** 32n - 1n) {
    throw new ErrorException(`${name} does not fit in uint32 seconds`);
  }
  return seconds;
}
