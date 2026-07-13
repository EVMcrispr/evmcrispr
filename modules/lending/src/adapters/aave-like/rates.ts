import { SECONDS_PER_YEAR } from "../../utils/rates";

const RAY = 1e27;

/**
 * Convert a ray-encoded APR (1e27, what Aave's rates are quoted in) to an
 * APY as a plain decimal fraction (2.04% -> 0.0204), compounding per second
 * the way aTokens and debt tokens accrue.
 */
export function rayAprToApy(rayApr: bigint): number {
  const apr = Number(rayApr) / RAY;
  if (apr === 0) return 0;
  return (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
}
