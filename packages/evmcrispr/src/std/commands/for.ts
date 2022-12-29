import { ErrorException } from '../../errors';
import { BindingsSpace, NodeType } from '../../types';
import type { Action, ICommand } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';

import type { Std } from '../Std';

const { USER } = BindingsSpace;
const { VariableIdentifier } = NodeType;

export const _for: ICommand<Std> = {
  async run(module, c, { interpretNode, actionCallback }) {
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
    const actions = [];

    module.bindingsManager.enterScope('for');
    for (const varValue of array) {
      module.bindingsManager.setBinding(
        varName,
        varValue,
        USER,
        false,
        undefined,
        true,
      );
      const commandActions = (await interpretNode(blockExpressionNode, {
        blockModule: module.contextualName,
        actionCallback,
      })) as Action[];
      actions.push(...commandActions);
    }
    module.bindingsManager.exitScope();
    return actions;
  },
  async runEagerExecution(c, cache) {
    const [varNameNode] = c.args;

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;

      cache.setBinding(varName, 'array-element', USER, false, undefined, true);

      return (eagerBindingsManager) =>
        eagerBindingsManager.setBinding(varName, 'array-element', USER);
    }
  },
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1:
        return ['of'];
      case 2: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [USER] });
      }
      default:
        return [];
    }
  },
};
