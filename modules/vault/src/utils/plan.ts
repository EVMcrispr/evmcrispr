import type { Action, Module } from "@evmcrispr/sdk";
import { coerceBoolean } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { buildApprovalActions } from "./approval";

/**
 * Prepend the auto-approve actions a command needs, honoring the
 * --no-approve escape hatch.
 */
export async function withApproval(
  module: Module,
  actions: Action[],
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
  opts: Record<string, any>,
): Promise<Action[]> {
  const skipApprove =
    opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
  if (skipApprove) return actions;
  const approvals = await buildApprovalActions(
    module,
    token,
    owner,
    spender,
    amount,
  );
  return [...approvals, ...actions];
}
