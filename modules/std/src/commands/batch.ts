import type {
  Action,
  BatchedAction,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  isTransactionAction,
} from "@evmcrispr/sdk";
import { compileSmartBatch } from "@evmcrispr/sdk/onchain";
import type Std from "..";

export default defineCommand<Std>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "batch",
  description: "Group multiple commands into a single transaction.",
  args: [
    {
      name: "block",
      type: "block",
      supportsSmartBlock: true,
      description: "Block of commands; use !(...) for smart execution",
    },
  ],
  opts: [
    {
      name: "salt",
      type: "bytes32",
      description:
        "Smart-block output-storage salt; reuse only to reproduce the same signed plan",
    },
  ],
  batchable: false,
  createsBatchContext: true,
  async run(module, { block }, { opts, interpreters }) {
    if (opts.salt !== undefined && !block.smart)
      throw new ErrorException("--salt requires a smart block (!(...))");
    if (block.smart) {
      const account = await module.getSender();
      const plan = await compileSmartBatch(
        module,
        block as BlockExpressionNode,
        interpreters,
        {
          name: "batch",
          account,
          route: "executor",
          salt: opts.salt,
        },
      );
      return plan.steps.length
        ? [{ type: "smartBatch", chainId: plan.chainId, from: account, plan }]
        : [];
    }
    const { interpretNode } = interpreters;

    const blockActions = (await interpretNode(block as BlockExpressionNode, {
      batchContext: { name: "batch", hasActions: false },
    })) as Action[];

    if (blockActions.find((a) => !isTransactionAction(a))) {
      throw new ErrorException(
        "can't use non-transaction actions inside a batch command",
      );
    }

    const txActions = blockActions as TransactionAction[];

    if (txActions.length === 0) {
      return [];
    }

    const chainId = await module.getChainId();
    const from = await module.getSender();

    const mismatch = txActions.find(
      (a) => a.from && a.from.toLowerCase() !== from.toLowerCase(),
    );
    if (mismatch) {
      throw new ErrorException(
        `action from ${mismatch.from} does not match batch sender ${from}`,
      );
    }

    const batched: BatchedAction = {
      type: "batched",
      chainId,
      from,
      actions: txActions,
    };

    return [batched];
  },
});
