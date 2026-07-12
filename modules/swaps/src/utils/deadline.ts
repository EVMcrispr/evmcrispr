import type { Module } from "@evmcrispr/sdk";
import { Num } from "@evmcrispr/sdk";

const DEFAULT_DEADLINE_SECONDS = 1200n;

/**
 * Resolve the --deadline opt, defaulting to 20 minutes after the latest
 * block timestamp. Block time (not wall clock) keeps deadlines meaningful
 * on time-warped sim forks.
 */
export async function resolveDeadline(
  module: Module,
  opts: Record<string, any>,
): Promise<bigint> {
  if (opts.deadline !== undefined) {
    return Num(opts.deadline).toBigInt();
  }
  const client = await module.getClient();
  const block = await client.getBlock();
  return block.timestamp + DEFAULT_DEADLINE_SECONDS;
}
