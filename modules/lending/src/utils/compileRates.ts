import { Num } from "@evmcrispr/sdk";
import type { CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import { arithCombine } from "@evmcrispr/sdk/onchain";
import { SECONDS_PER_YEAR } from "./rates";

/** A build-time integer operand at a given scale. */
const unit = (value: bigint, scale: number): Operand => ({
  kind: "const",
  cat: "Uint",
  value: Num.fromBigInt(value),
  ...(scale ? { scale } : {}),
});

/**
 * The on-chain form of `compoundToApy`: growth over a year minus the
 * principal, built out of the operand algebra so it reads as the same
 * computation the off-chain face performs.
 *
 * `perSecond` says whether the protocol already quotes a per-second rate
 * (Comet) or an annualized one that has to be divided down first (Aave).
 * The result carries the rate's own scale, so a comparison against a
 * literal like `0.05` scales the literal up rather than rounding it away.
 */
export function compileCompoundedApy(
  ctx: CompileCtx,
  rate: Operand,
  base: bigint,
  scale: number,
  opts: { perSecond: boolean },
): Operand {
  const scaled: Operand = { ...rate, scale };
  const perSecond = opts.perSecond
    ? scaled
    : arithCombine(ctx, "Div", scaled, unit(SECONDS_PER_YEAR, 0));

  const growth = arithCombine(
    ctx,
    "Exp",
    // One unit plus the per-period rate, at the protocol's own scale, so
    // `^` picks fixed-point exponentiation rather than the integer one.
    arithCombine(ctx, "Add", unit(base, scale), perSecond),
    unit(SECONDS_PER_YEAR, 0),
  );
  return arithCombine(ctx, "Sub", growth, unit(base, scale));
}
