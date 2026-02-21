import { isAddress } from "viem";

import type { BindingsManager } from "../BindingsManager";
import type { Node, NodeWithArguments, Position } from "../types";
import { BindingsSpace, NodeType } from "../types";

const {
  AddressLiteral,
  BoolLiteral,
  BlockExpression,
  BytesLiteral,
  NumberLiteral,
  StringLiteral,
  Bareword,
  VariableIdentifier,
} = NodeType;

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

/** Synchronous fast path for resolving simple node types (literals, barewords,
 *  variable identifiers). Used internally by `createNodeResolver` as the first
 *  attempt before falling back to async helper resolution. */
export const interpretNodeSync = (
  n: Node,
  bindingsManager: BindingsManager,
): string | undefined => {
  switch (n.type) {
    case AddressLiteral:
    case BoolLiteral:
    case BytesLiteral:
    case StringLiteral:
      return n.value;
    case NumberLiteral:
      return isAddress(n.value) ? n.value : undefined;
    case Bareword:
      return n.value;
    case VariableIdentifier: {
      const value = bindingsManager.getBindingValue(
        n.value,
        BindingsSpace.USER,
      );
      return value ?? undefined;
    }
  }
};

const isNodeWithArgs = (n: Node): n is NodeWithArguments => {
  if ((n as NodeWithArguments).args) {
    return true;
  }

  return false;
};
