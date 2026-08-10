import { Num, rpow } from "@evmcrispr/sdk";
import type { ScaledRate } from "../adapters/types";

export const SECONDS_PER_YEAR = 31_536_000n;

/** Aave quotes rates in ray. */
export const RAY = 10n ** 27n;
/** Comet quotes per-second rates in wad. */
export const WAD = 10n ** 18n;

/**
 * Compound a per-period rate over N periods and return the growth minus
 * the principal — the APY, scaled like its input.
 *
 * This is integer arithmetic, not floating point, and it is deliberately
 * the same computation the on-chain face performs: both sides run the
 * same binary exponentiation with the unit divided back out at each step,
 * so `@lending:apy` and `@lending:apy!` agree to the last unit instead of
 * being close.
 */
export function compoundToApy(
  ratePerPeriod: bigint,
  periods: bigint,
  unit: bigint,
): bigint {
  return rpow(unit + ratePerPeriod, periods, unit) - unit;
}

/** An APR quoted in ray, compounded per second the way aTokens accrue. */
export function rayAprToApy(rayApr: bigint): ScaledRate {
  return {
    value: compoundToApy(rayApr / SECONDS_PER_YEAR, SECONDS_PER_YEAR, RAY),
    scale: 27,
  };
}

/** A Comet per-second rate (wad) compounded over a year. */
export function perSecondRateToApy(rate: bigint): ScaledRate {
  return {
    value: compoundToApy(rate, SECONDS_PER_YEAR, WAD),
    scale: 18,
  };
}

/** The exact fraction a scaled rate stands for, as the rational a helper
 *  hands back (2.04% renders as 0.0204). */
export function rateAsNum({ value, scale }: ScaledRate): Num {
  return Num(value, 10n ** BigInt(scale));
}
