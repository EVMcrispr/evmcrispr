import type { BatchContext, NodesInterpreters } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Giveth from "..";

/** What a pending giveth action changes, per `${chainId}:${account}`:
 *  - `giv`      wallet GIV balance (claim +, stake −, unstake +)
 *  - `staked`   staked GIV (stake +, unstake −)
 *  - `locked`   the lm's totalAmountLocked (lock +, unlock −)
 *  - `unlocked` GIV freed by in-script unlocks (unlock +)
 *  - `claimed`  GIV claimed from the GIVstream (claim +)
 */
export type VirtualKind = "giv" | "staked" | "locked" | "unlocked" | "claimed";

/** Bucket key for deltas recorded outside any batch context. */
const GLOBAL: object = {};

/** Pending deltas per module instance. Module instances are recreated on
 *  every `interpret()` run, so keying the WeakMap by instance scopes the
 *  ledger to a single script run without any reset hook. */
const ledgers = new WeakMap<Giveth, Map<object, Map<string, bigint>>>();

function ledgerOf(module: Giveth): Map<object, Map<string, bigint>> {
  let ledger = ledgers.get(module);
  if (!ledger) {
    ledger = new Map();
    ledgers.set(module, ledger);
  }
  return ledger;
}

function bucketKey(kind: VirtualKind, chainId: number, account: Address) {
  return `${kind}:${chainId}:${account.toLowerCase()}`;
}

/**
 * Record what a command's pending actions will change once they execute.
 *
 * No-op when an `actionCallback` is present: the actions execute right after
 * the command returns (live run, sim:fork), so later on-chain reads already
 * include them. Without a callback the actions are only collected (plain
 * interpretation, `batch` bodies) and later reads would miss them — the
 * deltas bridge that gap.
 *
 * Deltas land in a bucket keyed by the enclosing batch context (or a global
 * one). Readers apply the global bucket plus their own batch's: in a live
 * run a batch executes at its boundary, so its bucket must not leak into
 * later reads, while everything recorded in the same still-pending batch —
 * or anywhere in a run with no executor at all — must.
 */
export function recordVirtual(
  module: Giveth,
  interpreters: NodesInterpreters,
  chainId: number,
  account: Address,
  deltas: Partial<Record<VirtualKind, bigint>>,
): void {
  if (interpreters.actionCallback) return;
  const ledger = ledgerOf(module);
  const bucketId = interpreters.batchContext ?? GLOBAL;
  let bucket = ledger.get(bucketId);
  if (!bucket) {
    bucket = new Map();
    ledger.set(bucketId, bucket);
  }
  for (const [kind, delta] of Object.entries(deltas)) {
    if (delta === undefined || delta === 0n) continue;
    const key = bucketKey(kind as VirtualKind, chainId, account);
    bucket.set(key, (bucket.get(key) ?? 0n) + delta);
  }
}

/** Sum of recorded deltas visible from the given batch context (the global
 *  bucket plus that batch's own). */
export function virtualOf(
  module: Giveth,
  batchContext: BatchContext | undefined,
  chainId: number,
  account: Address,
  kind: VirtualKind,
): bigint {
  const ledger = ledgerOf(module);
  const key = bucketKey(kind, chainId, account);
  let sum = ledger.get(GLOBAL)?.get(key) ?? 0n;
  if (batchContext) {
    sum += ledger.get(batchContext)?.get(key) ?? 0n;
  }
  return sum;
}
