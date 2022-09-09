import { ErrorException } from '../../../errors';
import { BindingsSpace } from '../../../BindingsManager';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';

const { VariableIdentifier } = NodeType;

export const set: CommandFunction<Std> = async (
  module,
  c,
  { interpretNode },
) => {
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

  module.bindingsManager.setBinding(varName, varValue, BindingsSpace.USER);
};
