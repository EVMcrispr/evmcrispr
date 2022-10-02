import type { Node, Position } from '../types';

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
