export enum ASTType {
  Program = "Program",
}

export enum NodeType {
  AddressLiteral = "AddressLiteral",
  BoolLiteral = "BoolLiteral",
  BytesLiteral = "BytesLiteral",
  NumberLiteral = "NumberLiteral",
  StringLiteral = "StringLiteral",

  AsExpression = "AsExpression",
  ArrayExpression = "ArrayExpression",
  BinaryExpression = "BinaryExpression",
  BlockExpression = "BlockExpression",
  CallExpression = "CallExpression",
  CommandExpression = "CommandExpression",
  HelperFunctionExpression = "HelperFunctionExpression",
  UnaryExpression = "UnaryExpression",

  ProbableIdentifier = "ProbableIdentifier",
  VariableIdentifier = "VariableIdentifier",

  CommandOpt = "CommandOpt",
  EventCapture = "EventCapture",
}

export type LiteralExpression =
  | NodeType.AddressLiteral
  | NodeType.BoolLiteral
  | NodeType.BytesLiteral
  | NodeType.NumberLiteral
  | NodeType.StringLiteral;

export type Position = {
  line: number;
  col: number;
};

export type Location = {
  start: Position;
  end: Position;
};

export interface Node {
  type: NodeType;
  value?: any;
  loc?: Location;
}

export interface AddressLiteralNode extends Node {
  type: NodeType.AddressLiteral;
  value: string;
}

export interface BytesLiteralNode extends Node {
  type: NodeType.BytesLiteral;
  value: string;
}

export interface StringLiteralNode extends Node {
  type: NodeType.StringLiteral;
  value: string;
}

export interface BooleanLiteralNode extends Node {
  type: NodeType.BoolLiteral;
  value: boolean;
}

export interface NumericLiteralNode extends Node {
  type: NodeType.NumberLiteral;
  value: string;
  power?: number;
  timeUnit?: string;
}

export interface ArrayExpressionNode extends Node {
  type: NodeType.ArrayExpression;
  elements: Node[];
}

export interface ProbableIdentifierNode extends Node {
  type: NodeType.ProbableIdentifier;
  value: string;
}

export interface VariableIdentifierNode extends Node {
  type: NodeType.VariableIdentifier;
  value: string;
}

export interface CallExpressionNode extends Node {
  type: NodeType.CallExpression;
  target: ArgumentExpressionNode;
  method: string;
  args: Node[];
}

export interface HelperFunctionNode extends Node {
  type: NodeType.HelperFunctionExpression;
  name: string;
  args: ArgumentExpressionNode[];
}

export interface EventCaptureBinding {
  /** Index path into event args, e.g. [1, 0, 1] from :1:0:1. Empty means [0]. */
  indexPath: number[];
  /** Named field accessor, e.g. "amount" from .amount */
  fieldName?: string;
  /** Variable name to store the value in (without $) */
  variable: string;
}

export interface EventCaptureNode extends Node {
  type: NodeType.EventCapture;
  /** Optional contract address filter node ($var or address literal) */
  contractFilter?: Node;
  /** Event name, e.g. "Withdrawn" */
  eventName: string;
  /** Inline event param types, e.g. ["uint","address"] from Withdrawn(uint,address) */
  eventParams?: string[];
  /** Which occurrence of the event to capture (from #N syntax, 0-based) */
  occurrence?: number;
  /** Bindings to capture from the event args */
  captures: EventCaptureBinding[];
}

export interface CommandExpressionNode extends Node {
  type: NodeType.CommandExpression;
  module?: string;
  name: string;
  args: Node[];
  opts: CommandOptNode[];
  eventCaptures?: EventCaptureNode[];
}

export interface CommandOptNode extends Node {
  type: NodeType.CommandOpt;
  name: string;
  value: ArgumentExpressionNode;
}

export interface BlockExpressionNode extends Node {
  type: NodeType.BlockExpression;
  body: CommandExpressionNode[];
}

export interface AsExpressionNode extends Node {
  type: NodeType.AsExpression;
  left: ProbableIdentifierNode | StringLiteralNode;
  right: ProbableIdentifierNode | StringLiteralNode;
}

export type OperableExpressionNode =
  | CallExpressionNode
  | HelperFunctionNode
  | NumericLiteralNode
  | BinaryExpressionNode;

export interface BinaryExpressionNode extends Node {
  type: NodeType.BinaryExpression;
  operator: "+" | "-" | "*" | "/" | "^";
  left: OperableExpressionNode;
  right: OperableExpressionNode;
}

export type NodeWithArguments =
  | CommandExpressionNode
  | HelperFunctionNode
  | CallExpressionNode;

export type LiteralExpressionNode =
  | AddressLiteralNode
  | BooleanLiteralNode
  | BytesLiteralNode
  | NumericLiteralNode
  | StringLiteralNode;

export type PrimaryExpressionNode =
  | LiteralExpressionNode
  | ProbableIdentifierNode
  | VariableIdentifierNode;

export type ArgumentExpressionNode =
  | BinaryExpressionNode
  | ArrayExpressionNode
  | CallExpressionNode
  | HelperFunctionNode
  | PrimaryExpressionNode;

export type CommandArgExpressionNode =
  | AsExpressionNode
  | ArgumentExpressionNode
  | BlockExpressionNode
  | CommandOptNode;

export interface AST {
  type: ASTType;
  body: Node[];
}
