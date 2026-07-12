import { ErrorException } from "@evmcrispr/sdk";

const BPS = 10_000n;

/** Convert a percent value (e.g. 0.5 for 0.5%) to basis points. */
export function pctToBps(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new ErrorException(
      `--slippage must be a percentage between 0 and 100, got ${pct}`,
    );
  }
  return Math.round(pct * 100);
}

/** Lower an expected output by a slippage tolerance (rounds down). */
export function applySlippageDown(amount: bigint, bps: number): bigint {
  return (amount * (BPS - BigInt(bps))) / BPS;
}

/** Raise an expected input by a slippage tolerance (rounds up). */
export function applySlippageUp(amount: bigint, bps: number): bigint {
  return (amount * (BPS + BigInt(bps)) + BPS - 1n) / BPS;
}
