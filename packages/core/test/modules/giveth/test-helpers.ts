import type { AST, CommandExpressionNode } from "@evmcrispr/sdk";

export const findGivethCommandNode = (
  ast: AST,
  commandName: string,
): CommandExpressionNode | undefined => {
  const commandNode = ast.body.find(
    (n) => (n as CommandExpressionNode).name === commandName,
  ) as CommandExpressionNode;

  return commandNode;
};
