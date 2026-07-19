import type {
  AST,
  BlockExpressionNode,
  CommandExpressionNode,
  Node,
} from "@evmcrispr/sdk";
import { ASTType, NodeType } from "@evmcrispr/sdk";

const isLineWithinBlock = ({ type, loc }: Node, line: number) =>
  !!(
    type === NodeType.BlockExpression &&
    loc &&
    line >= loc.start.line &&
    line <= loc.end.line
  );

export class EvmlAST implements AST {
  type: ASTType = ASTType.Program;
  body: CommandExpressionNode[];

  constructor(body: CommandExpressionNode[]) {
    this.body = body;
  }

  getCommandAtLine(line: number): CommandExpressionNode | undefined {
    return this.#getCommandAtLine(line, this.body);
  }

  getCommandsUntilLine(
    line: number,
    globalScopeCommandNames?: string[],
  ): CommandExpressionNode[] {
    return this.#getCommandsUntilLine(
      this.body,
      line,
      true,
      globalScopeCommandNames,
    );
  }

  /**
   * Walk every command in the AST up to (and including) `line`,
   * descending into every block expression regardless of whether it
   * encloses `line`. Returns a flat list in DFS pre-order (parent
   * before its block's children). Used by the prewarm walker so that
   * hover sees bindings produced by any command — `set`, `contracts:deploy`,
   * `new-dao`, `install`, `for`, `sign`, command-with-event/error
   * captures, ... — without having to enumerate command names by hand.
   */
  getAllCommandsUntilLine(line: number): CommandExpressionNode[] {
    return this.#getAllCommandsUntilLine(this.body, line);
  }

  #getAllCommandsUntilLine(
    body: CommandExpressionNode[],
    line: number,
  ): CommandExpressionNode[] {
    const out: CommandExpressionNode[] = [];
    for (const c of body) {
      if (c.loc?.start.line && c.loc.start.line > line) continue;
      out.push(c);
      for (const arg of c.args) {
        if (arg.type === NodeType.BlockExpression) {
          out.push(
            ...this.#getAllCommandsUntilLine(
              (arg as BlockExpressionNode).body,
              line,
            ),
          );
        }
      }
    }
    return out;
  }

  #getCommandAtLine(
    line: number,
    body: CommandExpressionNode[],
  ): ReturnType<typeof this.getCommandAtLine> {
    const selectedNode: CommandExpressionNode | undefined = body.find(
      (c) => c.loc?.start.line === line,
    );

    if (selectedNode) {
      return selectedNode;
    }

    for (const c of body) {
      const blockNode = c.args.find((n) =>
        isLineWithinBlock(n, line),
      ) as BlockExpressionNode;

      if (blockNode) {
        const command = this.#getCommandAtLine(line, blockNode.body);

        return command;
      }
    }
  }

  #getCommandsUntilLine(
    body: CommandExpressionNode[],
    line: number,
    lineWithinBlock: boolean,
    globalScopeCommandNames?: string[],
  ): ReturnType<typeof this.getCommandsUntilLine> {
    const commands: CommandExpressionNode[] = [];

    body.forEach((c) => {
      // Skip nodes higher than given line
      if (c.loc?.start.line && c.loc?.start.line > line) {
        return;
      }

      if (lineWithinBlock || globalScopeCommandNames?.includes(c.name)) {
        commands.push(c);
      }

      // Check for block expressions
      c.args.forEach((arg) => {
        if (
          isLineWithinBlock(arg, line) ||
          (arg.type === NodeType.BlockExpression &&
            globalScopeCommandNames?.length)
        ) {
          const argBlock = arg as BlockExpressionNode;
          const innerCommands = this.#getCommandsUntilLine(
            argBlock.body,
            line,
            isLineWithinBlock(argBlock, line),
            globalScopeCommandNames,
          );
          commands.push(...innerCommands);
        }
      });
    });

    return commands;
  }
}
