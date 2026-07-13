import type { Action, Module } from "@evmcrispr/sdk";
import { coerceBoolean } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { buildApprovalActions } from "./approval";

/**
 * `--no-approve` suppresses every authorization prerequisite a command
 * would otherwise assemble automatically: ERC-20 approvals AND flow
 * operator (ACL) grants.
 */
export function skipPrereqs(opts: Record<string, any>): boolean {
  return opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
}

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
  if (skipPrereqs(opts)) return actions;
  const approvals = await buildApprovalActions(
    module,
    token,
    owner,
    spender,
    amount,
  );
  return [...approvals, ...actions];
}
