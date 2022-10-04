import { ErrorException } from '../../../errors';
import { BindingsSpace, NodeType } from '../../../types';
import type { ICommand } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';

const { VariableIdentifier } = NodeType;
const { ADDR, USER } = BindingsSpace;

export const set: ICommand<Std> = {
  buildCompletionItemsForArg(argIndex, nodeArgs, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1: {
        const currentVarName = nodeArgs[0].value;
        const labels = cache
          .getAllBindingIdentifiers({ spaceFilters: [ADDR] })
          // Filter out the variable being declared
          .filter((identifier) => identifier !== currentVarName);
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

    if (module.bindingsManager.getBindingValue(varName, BindingsSpace.USER)) {
      throw new ErrorException(`${varName} already defined`);
    }

    module.bindingsManager.setBinding(varName, varValue, USER, true);
  },
  async runEagerExecution({ args }) {
    const [varNameNode, varValueNode] = args;

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;
      return { identifier: varName, value: varValueNode?.value, type: USER };
    }
  },
};
