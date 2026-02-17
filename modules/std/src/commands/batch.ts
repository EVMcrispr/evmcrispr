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
  resolveEventCaptures,
} from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "batch",
  description: "Group multiple commands into a single transaction.",
  args: [{ name: "block", type: "block" }],
  async run(module, { block }, { node, interpreters }) {
    const { interpretNode, actionCallback } = interpreters;

    // actionCallback is intentionally NOT forwarded here: nested commands
    // must only collect actions, not execute them. Event captures (-> ...)
    // are resolved on the batch itself once the combined transaction lands.
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

    // Handle event captures: dispatch action, decode receipt logs, store variables
    if (node.eventCaptures && node.eventCaptures.length > 0) {
      if (!actionCallback) {
        throw new ErrorException(
          "event capture requires an execution context with transaction access",
        );
      }

      const receipt = await actionCallback(batched);

      await resolveEventCaptures(
        receipt as { logs: any[] },
        undefined, // batch has no single contract ABI; inline signatures are used
        node.eventCaptures,
        module.bindingsManager,
        interpretNode,
      );

      return []; // action already dispatched
    }

    return [batched];
  },
});
