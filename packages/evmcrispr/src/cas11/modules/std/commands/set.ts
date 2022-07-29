import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import type { Std } from '../Std';

const { VariableIdentifier } = NodeType;
const errorPrefix = 'Set command error';

export const set: CommandFunction<Std> = async (std, lazyNodes) => {
  if (lazyNodes.length !== 2) {
    throw new Error(`${errorPrefix}: invalid number of arguments. Expected 2`);
  }

  const [varLazyNode, valueLazyNode] = lazyNodes;

  if (varLazyNode.type !== VariableIdentifier) {
    throw new Error(`${errorPrefix}: invalid variable`);
  }

  const varName = (await varLazyNode.resolve(true)) as string;
  const varValue = await valueLazyNode.resolve();

  std.bindingsManager.setBinding(varName, varValue, true);
};
