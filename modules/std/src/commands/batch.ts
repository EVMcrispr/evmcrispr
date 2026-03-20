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
import type Std from "..";

export default defineCommand<Std>({
  name: "batch",
  description: "Group multiple commands into a single transaction.",
  args: [{ name: "block", type: "block", description: "Block of commands" }],
  async run(module, { block }, { interpreters }) {
    const { interpretNode } = interpreters;

    const blockActions = (await interpretNode(block as BlockExpressionNode, {
      blockModule: module.contextualName,
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
    const from = await module.getConnectedAccount();

    const batched: BatchedAction = {
      type: "batched",
      chainId,
      from,
      actions: txActions,
    };

    return [batched];
  },
});
