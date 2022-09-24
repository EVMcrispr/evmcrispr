import type { AST, BlockExpressionNode, CommandExpressionNode } from './types';
import { ASTType, NodeType } from './types';

export type Cas11ASTCommand = {
  node: CommandExpressionNode;
  parent?: Cas11ASTCommand;
};

export class Cas11AST implements AST {
  type: ASTType = ASTType.Program;
  body: CommandExpressionNode[];

  constructor(body: CommandExpressionNode[]) {
    this.body = body;
  }

  getCommandAtLine(line: number): Cas11ASTCommand | undefined {
    return this.#getCommandAtLine(this.body, line);
  }

  getCommandsUntilLine(
    commandNames: string[],
    line: number,
  ): Cas11ASTCommand[] {
    return this.#getCommandsUntilLine(this.body, commandNames, line);
  }

  #getCommandAtLine(
    body: CommandExpressionNode[],
    line: number,
    parent?: Cas11ASTCommand,
  ): ReturnType<typeof this.getCommandAtLine> {
    const selectedNode: CommandExpressionNode | undefined = body.find(
      (c) => c.loc?.start.line === line,
    );

    if (selectedNode) {
      return {
        node: selectedNode,
        parent,
      };
    }

    for (const c of body) {
      const blockNode = c.args.find(
        ({ type, loc }) =>
          type === NodeType.BlockExpression &&
          line >= loc!.start.line &&
          line <= loc!.end.line,
      ) as BlockExpressionNode;

      if (blockNode) {
        const command = this.#getCommandAtLine(blockNode.body, line, {
          node: c,
          parent,
        });

        return command;
      }
    }
  }

  #getCommandsUntilLine(
    body: CommandExpressionNode[],
    names: string[],
    line: number,
    parent?: Cas11ASTCommand,
  ): ReturnType<typeof this.getCommandsUntilLine> {
    const commands: Cas11ASTCommand[] = [];

    body.forEach((c) => {
      // Skip nodes higher than given line
      if (c.loc?.start.line && c.loc?.start.line > line) {
        return;
      }

      if (names.includes(c.name)) {
        commands.push({ node: c, parent });
      }

      // Check for block expressions
      c.args.forEach((arg) => {
        if (arg.type === NodeType.BlockExpression) {
          const innerCommands = this.#getCommandsUntilLine(
            (arg as BlockExpressionNode).body,
            names,
            line,
            { node: c, parent },
          );
          commands.push(...innerCommands);
        }
      });
    });

    return commands;
  }
}
