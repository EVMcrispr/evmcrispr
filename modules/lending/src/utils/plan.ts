import type { Action, Module } from "@evmcrispr/sdk";
import { coerceBoolean } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type { LendingPlan } from "../adapters/types";
import { buildApprovalActions } from "./approval";

/**
 * Prepend the auto-approve actions a plan asks for, honoring the
 * --no-approve escape hatch.
 */
export async function withApproval(
  module: Module,
  plan: LendingPlan,
  token: Address,
  owner: Address,
  opts: Record<string, any>,
): Promise<Action[]> {
  const skipApprove =
    opts["no-approve"] !== undefined && coerceBoolean(opts["no-approve"]);
  if (
    skipApprove ||
    !plan.approvalTarget ||
    plan.approvalAmount === undefined
  ) {
    return plan.actions;
  }
  const approvals = await buildApprovalActions(
    module,
    token,
    owner,
    plan.approvalTarget,
    plan.approvalAmount,
  );
  return [...approvals, ...plan.actions];
}
