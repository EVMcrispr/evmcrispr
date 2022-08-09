import { BindingsSpace } from '../../../interpreter/BindingsManager';
import { Interpreter } from '../../../interpreter/Interpreter';
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
    Interpreter.panic(c, 'expected a variable identifier');
  }

  const varName = varNode.value;
  const varValue = await interpretNode(valueNode);

  module.bindingsManager.setBinding(varName, varValue, BindingsSpace.USER);
};
