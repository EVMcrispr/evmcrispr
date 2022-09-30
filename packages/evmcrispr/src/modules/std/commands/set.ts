import { ErrorException } from '../../../errors';
import { BindingsSpace } from '../../../BindingsManager';
import type { ICommand } from '../../../types';
import { NodeType } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';

const { VariableIdentifier } = NodeType;
const { ADDR, USER } = BindingsSpace;

export const set: ICommand<Std> = {
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1: {
        const labels = cache
          .getBindingsFromSpaces(ADDR, USER)
          .map((b) => b.identifier);
        return labels;
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

    if (module.bindingsManager.getBinding(varName, BindingsSpace.USER)) {
      throw new ErrorException(`${varName} already defined`);
    }

    module.bindingsManager.setBinding(
      varName,
      varValue,
      BindingsSpace.USER,
      true,
    );
  },
  async runEagerExecution(nodeArgs) {
    const varNameNode = nodeArgs[0];

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;
      return { identifier: varName, value: varName, type: BindingsSpace.USER };
    }
  },
};
