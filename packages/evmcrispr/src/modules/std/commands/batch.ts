import { ErrorException } from "../../../errors";
import type {
  Action,
  BatchedAction,
  ICommand,
  TransactionAction,
} from "../../../types";
import { isTransactionAction, NodeType } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import { resolveEventCaptures } from "../../../utils/events";
import type { Std } from "../Std";

export const batch: ICommand<Std> = {
  async run(module, c, { interpretNode, actionCallback }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });

    const [blockExpressionNode] = c.args;

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException("batch expects a block of commands");
    }

    // actionCallback is intentionally NOT forwarded here: nested commands
    // must only collect actions, not execute them. Event captures (-> ...)
    // are resolved on the batch itself once the combined transaction lands.
    const blockActions = (await interpretNode(blockExpressionNode, {
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
    if (c.eventCaptures && c.eventCaptures.length > 0) {
      if (!actionCallback) {
        throw new ErrorException(
          "event capture requires an execution context with transaction access",
        );
      }

      const receipt = await actionCallback(batched);

      await resolveEventCaptures(
        receipt as { logs: any[] },
        undefined, // batch has no single contract ABI; inline signatures are used
        c.eventCaptures,
        module.bindingsManager,
        interpretNode,
      );

      return []; // action already dispatched
    }

    return [batched];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
};
