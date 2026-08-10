import { chainLabel, ErrorException } from "@evmcrispr/sdk";

/**
 * The EIP-4844 blob-fee denominator for a given chain and block.
 *
 * It is not a constant, which is the whole reason this table exists. It was
 * 3338477 at Cancun, EIP-7691 raised it to 5007716 at Prague, and the BPO
 * forks raise it again — so a single hardcoded value is wrong on any chain
 * past the fork it was copied from, and wrong again after the next one. The
 * helper used to hardcode Cancun's, which on a recent mainnet block overstated
 * the fee by about seventeen orders of magnitude.
 *
 * The data below was extracted from @ethereumjs/common 10.1.2 rather than
 * depending on it at runtime: a package that ships an EventEmitter and a
 * chain-config engine is a lot to carry for four numbers and a handful of
 * timestamps, and this is static data that a dependency would not keep fresher
 * than a review would.
 *
 * The trade is that it goes stale on its own. Refresh it when a chain forks:
 *
 *   bun -e 'const {Common,Mainnet}=await import("@ethereumjs/common"); …'
 *
 * Forks are keyed by TIMESTAMP, not block number: everything since the merge
 * is scheduled that way, and a block number would silently pick the wrong side
 * of a fork.
 */

/** Denominator in force from each fork, oldest first. */
interface ForkPoint {
  /** Activation timestamp on this chain, in seconds. */
  from: bigint;
  fraction: bigint;
}

/**
 * Per-chain schedules. Only chains with a published blob schedule appear:
 * inventing one for a chain we do not know would return a plausible wrong
 * number, and the result feeds an assertion.
 */
const SCHEDULES: Record<number, ForkPoint[]> = {
  // mainnet
  1: [
    { from: 1710338135n, fraction: 3338477n }, // cancun
    { from: 1746612311n, fraction: 5007716n }, // prague
    { from: 1765290071n, fraction: 8346193n }, // bpo1
    { from: 1767747671n, fraction: 11684671n }, // bpo2
  ],
  // holesky
  17000: [
    { from: 1707305664n, fraction: 3338477n },
    { from: 1740434112n, fraction: 5007716n },
    { from: 1759800000n, fraction: 8346193n },
    { from: 1760389824n, fraction: 11684671n },
  ],
  // sepolia
  11155111: [
    { from: 1706655072n, fraction: 3338477n },
    { from: 1741159776n, fraction: 5007716n },
    { from: 1761017184n, fraction: 8346193n },
    { from: 1761607008n, fraction: 11684671n },
  ],
  // hoodi
  560048: [
    { from: 0n, fraction: 3338477n },
    { from: 1742999832n, fraction: 5007716n },
    { from: 1762365720n, fraction: 8346193n },
    { from: 1762955544n, fraction: 11684671n },
  ],
};

/**
 * The denominator in force on `chainId` at `timestamp`.
 *
 * Callers should skip this entirely when `excessBlobGas` is zero: the
 * exponential is then the floor whatever the denominator, so a quiet chain
 * needs no schedule at all. That is what keeps this from breaking the chains
 * absent from the table, which is most of them.
 */
export function blobBaseFeeUpdateFraction(
  chainId: number,
  timestamp: bigint,
): bigint {
  const schedule = SCHEDULES[chainId];
  if (!schedule) {
    throw new ErrorException(
      `no blob-fee schedule known for ${chainLabel(chainId)}, so a non-zero excess blob gas cannot be priced — the denominator changes at Cancun, Prague and each BPO fork, and guessing one would return a plausible wrong number`,
    );
  }
  let fraction: bigint | undefined;
  for (const point of schedule) {
    if (timestamp >= point.from) fraction = point.fraction;
  }
  if (fraction === undefined) {
    throw new ErrorException(
      `block at ${timestamp} predates the blob fee market on ${chainLabel(chainId)}`,
    );
  }
  return fraction;
}
