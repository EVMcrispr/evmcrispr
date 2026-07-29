import type { Node, NodeWithArguments, Position } from "../types";
import { NodeType } from "../types";

const { BlockExpression } = NodeType;

const insideNode = ({ loc }: Node, pos: Position): boolean => {
  if (!loc) {
    return false;
  }

  const { start, end } = loc;

  return (
    pos.line >= start.line &&
    pos.line <= end.line &&
    pos.col >= start.col &&
    pos.col <= end.col
  );
};

export const calculateCurrentArgIndex = (
  n: NodeWithArguments,
  pos: Position,
): number => {
  let i = 0;
  let lastArgCol = n.loc!.start.col;

  while (i < n.args.length) {
    const argNode = n.args[i];
    const argLoc = argNode.loc!;

    if (insideNode(argNode, pos)) {
      return i;
      /**
       * For cases where the position is located between two arguments we
       * return the former's index
       */
    } else if (pos.col > lastArgCol && pos.col < argLoc.start.col) {
      return i;
    }

    lastArgCol = argLoc.end.col;
    i++;
  }
  return n.args.length;
};

export const hasCommandsBlock = (n: NodeWithArguments): boolean =>
  !!n.args.find((arg) => arg.type === BlockExpression);

export const getDeepestNodeWithArgs = (
  n: NodeWithArguments,
  pos: Position,
): { node: NodeWithArguments; arg: Node; argIndex: number } => {
  let currentNodeWithArgs = n;
  let currentArgIndex = calculateCurrentArgIndex(n, pos);
  let currentArg = currentNodeWithArgs.args[currentArgIndex];

  while (currentArg && isNodeWithArgs(currentArg)) {
    const candidate = currentArg as NodeWithArguments;
    if (
      candidate.args.length === 0 &&
      candidate.loc &&
      "name" in candidate &&
      typeof (candidate as any).name === "string"
    ) {
      const nameEnd =
        candidate.loc.start.col +
        1 +
        ((candidate as any).name as string).length;
      if (pos.col <= nameEnd) break;
    }
    currentNodeWithArgs = candidate;
    currentArgIndex = calculateCurrentArgIndex(currentNodeWithArgs, pos);
    currentArg = currentNodeWithArgs.args[currentArgIndex];
  }

  return {
    node: currentNodeWithArgs,
    arg: currentArg,
    argIndex: currentArgIndex,
  };
};

const isNodeWithArgs = (n: Node): n is NodeWithArguments => {
  if ((n as NodeWithArguments).args) {
    return true;
  }

  return false;
};
