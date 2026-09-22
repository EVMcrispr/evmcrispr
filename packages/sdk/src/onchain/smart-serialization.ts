import { ErrorException } from "../errors";
import type { SmartBatchPlan } from "./smart-types";

/** JSON transport for plans containing ordinary calls with bigint values. */
export function serializeSmartBatchPlan(plan: SmartBatchPlan): string {
  return JSON.stringify(plan, (_key, value) =>
    typeof value === "bigint" ? { $bigint: value.toString() } : value,
  );
}

/** Deployment/account verification still runs before executing a restored plan. */
export function deserializeSmartBatchPlan(json: string): SmartBatchPlan {
  const plan = JSON.parse(json, (_key, value) =>
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    typeof value.$bigint === "string" &&
    /^-?\d+$/.test(value.$bigint)
      ? BigInt(value.$bigint)
      : value,
  );
  if (
    plan?.version !== 1 ||
    !Array.isArray(plan.steps) ||
    !Array.isArray(plan.captures) ||
    !Array.isArray(plan.dependencies) ||
    !/^0x[\da-fA-F]{64}$/.test(plan.salt)
  )
    throw new ErrorException("invalid smart-batch plan");
  return plan as SmartBatchPlan;
}
