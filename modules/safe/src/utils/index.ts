import type {
  Action,
  Address,
  BlockExpressionNode,
  NodesInterpreters,
  TransactionAction,
} from "@evmcrispr/sdk";
import { Num, withSender } from "@evmcrispr/sdk";
import type { SmartBatchPlan } from "@evmcrispr/sdk/onchain";
import {
  compileSmartBatch,
  lowerSmartBatch,
  verifySmartDeployment,
} from "@evmcrispr/sdk/onchain";
import type Safe from "..";
import { assertAllTransactionActions } from "./safeTx";

export * from "./hashes";
export * from "./multisend";
export * from "./reads";
export * from "./safeTx";
export * from "./txService";
export * from "./zodiac";

const smartPlans = new WeakMap<TransactionAction[], SmartBatchPlan>();
export const smartPlanFor = (actions?: TransactionAction[]) =>
  actions && smartPlans.get(actions);

export const toBigInt = (value: unknown): bigint => {
  if (value instanceof Num) return value.toBigInt();
  if (typeof value === "bigint") return value;
  return BigInt(String(value));
};

/**
 * Interpret the trailing block of `safe:propose` / `safe:execute` with the
 * target Safe pushed as the module's current Safe context, and collect the
 * inner transaction actions.
 */
export const interpretSafeBlock = async (
  module: Safe,
  safe: Address,
  block: BlockExpressionNode,
  commandName: string,
  interpreters: NodesInterpreters,
  options: { salt?: `0x${string}` } = {},
): Promise<TransactionAction[]> => {
  let actions: Action[];
  let pushed = false;
  try {
    if (block.smart) {
      const plan = await compileSmartBatch(module, block, interpreters, {
        name: commandName,
        account: safe,
        route: "delegatecall",
        salt: options.salt,
        blockInitializer: async () => {
          module.pushSafe(safe);
          pushed = true;
        },
      });
      if (plan.steps.length)
        await verifySmartDeployment(await module.getClient(), plan);
      const lowered = lowerSmartBatch(plan);
      smartPlans.set(lowered, plan);
      return lowered;
    }
    // The block's calls execute from the Safe: `@sender` is the Safe.
    actions = (await withSender(module, safe, () =>
      interpreters.interpretNode(block, {
        // Safe commands work unprefixed inside the block (like aragonos
        // connect); std commands (`exec`, `batch`, …) resolve via the usual
        // std fallback since no safe command shadows them.
        blockInitializer: async () => {
          module.pushSafe(safe);
          pushed = true;
        },
        // Inherit hasActions from any enclosing batch context: reads inside
        // this block can't see the outer batch's actions either.
        batchContext: {
          name: commandName,
          hasActions: interpreters.batchContext?.hasActions ?? false,
        },
      }),
    )) as Action[];
  } finally {
    if (pushed) module.popSafe();
  }

  return assertAllTransactionActions(actions, commandName);
};
