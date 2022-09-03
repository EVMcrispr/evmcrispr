import type { AST, CommandExpressionNode } from '../../src/cas11/types';

export const findStdCommandNode = (
  ast: AST,
  commandName: string,
): CommandExpressionNode | undefined => {
  const commandNode = ast.body.find(
    (n) => (n as CommandExpressionNode).name === commandName,
  ) as CommandExpressionNode;

  return commandNode;
};
