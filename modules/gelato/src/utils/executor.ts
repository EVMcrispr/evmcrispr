import type { Action, Module } from "@evmcrispr/sdk";
import { withSender } from "@evmcrispr/sdk";
import type { Address } from "viem";

/**
 * Run `fn` with `executor` (the dedicated msg.sender) as the account the
 * calls are sent from — `@sender`, and the `from` a batch stamps — in its
 * own binding scope, so variables the block sets do not leak. `@me` stays
 * the connected wallet.
 */
export async function asExecutor<T>(
  module: Module,
  executor: Address,
  fn: () => Promise<T>,
): Promise<T> {
  module.bindingsManager.enterScope();
  try {
    return await withSender(module, executor, fn);
  } finally {
    module.bindingsManager.exitScope();
  }
}

/** The actions a block or node list produced (nested arrays flattened,
 *  empty results dropped). */
export function collectActions(results: unknown): Action[] {
  const out: Action[] = [];
  const visit = (r: unknown) => {
    if (Array.isArray(r)) for (const x of r) visit(x);
    else if (r) out.push(r as Action);
  };
  visit(results);
  return out;
}
