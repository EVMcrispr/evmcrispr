import { utils } from 'ethers';

import type { BindingsManager } from '../BindingsManager';
import type {
  Address,
  AddressLiteralNode,
  Node,
  NodeWithArguments,
  Position,
  ProbableIdentifierNode,
  StringLiteralNode,
  VariableIdentifierNode,
} from '../types';
import { BindingsSpace, NodeType } from '../types';

const {
  AddressLiteral,
  BoolLiteral,
  BlockExpression,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,
  ProbableIdentifier,
  VariableIdentifier,
} = NodeType;

export const insideNodeLine = ({ loc }: Node, { line }: Position): boolean => {
  if (!loc) {
    return false;
  }

  const { start, end } = loc;

  return line >= start.line && line <= end.line;
};

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

export const inSameLineThanNode = ({ loc }: Node, pos: Position): boolean => {
  return loc?.start.line === pos.line;
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
    pos.line === loc.start.line &&
    pos.col <= loc[strictBefore ? 'start' : 'end'].col
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
      return Math.min(0, i - 1);
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
    currentNodeWithArgs = currentArg;
    currentArgIndex = calculateCurrentArgIndex(currentNodeWithArgs, pos);
    currentArg = currentNodeWithArgs.args[currentArgIndex];
  }

  return {
    node: currentNodeWithArgs,
    arg: currentArg,
    argIndex: currentArgIndex,
  };
};

export const interpretNodeSync = (
  n: Node,
  bindingsManager: BindingsManager,
): Address | undefined => {
  switch (n.type) {
    case AddressLiteral:
    case BoolLiteral:
    case BytesLiteral:
    case StringLiteral:
      return n.value;
    case NumberLiteral:
      return utils.isAddress(n.value) ? n.value : undefined;
    case ProbableIdentifier:
      return (
        bindingsManager.getBindingValue(n.value, BindingsSpace.ADDR) ?? n.value
      );
    case VariableIdentifier: {
      const value = bindingsManager.getBindingValue(
        n.value,
        BindingsSpace.USER,
      );
      return value ?? undefined;
    }
  }
};

export const isAddressNodishType = (
  n: Node,
): n is
  | AddressLiteralNode
  | StringLiteralNode
  | ProbableIdentifierNode
  | VariableIdentifierNode =>
  [
    AddressLiteral,
    StringLiteral,
    ProbableIdentifier,
    VariableIdentifier,
  ].includes(n.type);

export const isNodeWithArgs = (n: Node): n is NodeWithArguments => {
  if ((n as NodeWithArguments).args) {
    return true;
  }

  return false;
};
