import { ErrorException } from '../../../errors';

import type { Action, ICommand } from '../../../types';
import { BindingsSpace, NodeType } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';

import type { Std } from '../Std';

const { USER } = BindingsSpace;
const { VariableIdentifier } = NodeType;

export const _for: ICommand<Std> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 4,
    });

    const [varNode, connectorNode, arrayNode, blockExpressionNode] = c.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(`expected a variable identifier`);
    }

    if (connectorNode.value !== 'of') {
      throw new ErrorException(`expected of`);
    }

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const varName = varNode.value;
    const array = await interpretNode(arrayNode);

    // module.bindingsManager.enterScope()
    for (const varValue of array) {
      module.bindingsManager.setBinding(
        varName,
        varValue,
        USER,
        true,
        undefined,
        true,
      );
      const actions = (await interpretNode(blockExpressionNode, {
        blockModule: module.contextualName,
      })) as Action[];
      console.log(actions);
    }
    // module.bindingsManager.exitScope()

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
