import type { AST, CommandExpressionNode } from '../../src/types';

export const findStdCommandNode = (
  ast: AST,
  commandName: string,
): CommandExpressionNode | undefined => {
  const commandNode = ast.body.find(
    (n) => (n as CommandExpressionNode).name === commandName,
  ) as CommandExpressionNode;

  return commandNode;
};
