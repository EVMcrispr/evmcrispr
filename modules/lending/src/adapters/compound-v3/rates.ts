import { SECONDS_PER_YEAR } from "../../utils/rates";

/**
 * Convert a Comet per-second rate (1e18-scaled, from getSupplyRate /
 * getBorrowRate) to an APY as a plain decimal fraction (2.04% -> 0.0204).
 */
export function perSecondRateToApy(rate: bigint): number {
  const r = Number(rate) / 1e18;
  if (r === 0) return 0;
  return (1 + r) ** SECONDS_PER_YEAR - 1;
}
