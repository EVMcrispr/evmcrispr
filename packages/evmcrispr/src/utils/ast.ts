import type { Node, NodeWithArguments, Position } from '../types';
import { NodeType } from '../types';

export const insideNode = ({ loc }: Node, pos: Position): boolean => {
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

export const beforeOrEqualNode = (
  { loc }: Node,
  pos: Position,
  strictBefore = false,
): boolean => {
  if (!loc) {
    return false;
  }

  return (
    pos.line < loc.start.line ||
    pos.col < loc[strictBefore ? 'start' : 'end'].col
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
    } else if (lastArgCol > pos.col && pos.col < argLoc.start.col) {
      return i - 1;
    }

    lastArgCol = argLoc.end.col;
    i++;
  }
  return n.args.length;
};

export const hasCommandsBlock = (n: NodeWithArguments): boolean =>
  !!n.args.find((arg) => arg.type === NodeType.BlockExpression);
