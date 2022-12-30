import { ErrorException } from '../../errors';
import { BindingsSpace, NodeType } from '../../types';
import type { ICommand } from '../../types';
import {
  ComparisonType,
  checkArgsLength,
  inSameLineThanNode,
} from '../../utils';
import type { Std } from '../Std';

const { VariableIdentifier } = NodeType;
const { ADDR, USER } = BindingsSpace;

export const set: ICommand<Std> = {
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [ADDR] });
      }
      default:
        return [];
    }
  },
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 2 });

    const [varNode, valueNode] = c.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(`expected a variable identifier`);
    }

    const varName = varNode.value;
    const varValue = await interpretNode(valueNode);

    module.bindingsManager.setBinding(
      varName,
      varValue,
      USER,
      true,
      undefined,
      true,
    );
  },
  async runEagerExecution(c, cache, __, caretPos) {
    if (inSameLineThanNode(c, caretPos)) {
      return;
    }

    const [varNameNode, varValueNode] = c.args;

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;
      const varValue = varValueNode.value;

      cache.setBinding(varName, varValue, USER, false, undefined, true);

      return (eagerBindingsManager) =>
        eagerBindingsManager.setBinding(varName, varValueNode.value, USER);
    }
  },
};
