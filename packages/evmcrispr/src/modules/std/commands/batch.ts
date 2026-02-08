import { ErrorException } from "../../../errors";
import type {
  Action,
  BatchedAction,
  ICommand,
  TransactionAction,
} from "../../../types";
import { isTransactionAction, NodeType } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import type { Std } from "../Std";

export const batch: ICommand<Std> = {
  async run(module, c, { interpretNode }) {
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

    return [batched];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
};
