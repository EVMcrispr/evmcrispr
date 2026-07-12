import type {
  Action,
  Address,
  BlockExpressionNode,
  NodesInterpreters,
  TransactionAction,
} from "@evmcrispr/sdk";
import { Num } from "@evmcrispr/sdk";
import type Safe from "..";
import { assertAllTransactionActions } from "./safeTx";

export * from "./multisend";
export * from "./reads";
export * from "./safeTx";
export * from "./txService";
export * from "./zodiac";

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
): Promise<TransactionAction[]> => {
  let actions: Action[];
  let pushed = false;
  try {
    actions = (await interpreters.interpretNode(block, {
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
    })) as Action[];
  } finally {
    if (pushed) module.popSafe();
  }

  return assertAllTransactionActions(actions, commandName);
};
