export enum ASTType {
  Program = 'Program',
}

export enum NodeType {
  AddressLiteral = 'AddressLiteral',
  BoolLiteral = 'BoolLiteral',
  BytesLiteral = 'BytesLiteral',
  NumberLiteral = 'NumberLiteral',
  StringLiteral = 'StringLiteral',

  AsExpression = 'AsExpression',
  ArrayExpression = 'ArrayExpression',
  BinaryExpression = 'BinaryExpression',
  BlockExpression = 'BlockExpression',
  CallExpression = 'CallExpression',
  CommandExpression = 'CommandExpression',
  GroupingExpression = 'GroupingExpression',
  HelperFunctionExpression = 'HelperFunctionExpression',
  UnaryExpression = 'UnaryExpression',

  CommandIdentifier = 'CommandIdentifier',
  ProbableIdentifier = 'ProbableIdentifier',
  VariableIdentifier = 'VariableIdentifier',

  CommandOpt = 'CommandOpt',
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
  value: number;
  power?: number;
  timeUnit?: string;
}

export interface ArrayExpressionNode extends Node {
  type: NodeType.ArrayExpression;
  elements: Node[];
}

export interface GroupingExpressionNode extends Node {
  type: NodeType.GroupingExpression;
  expression: Node;
}

export interface ProbableIdentifierNode extends Node {
  type: NodeType.ProbableIdentifier;
  value: string;
}

export interface VariableIdentiferNode extends Node {
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

export interface CommandExpressionNode extends Node {
  type: NodeType.CommandExpression;
  module?: string;
  name: string;
  args: Node[];
  opts: CommandOptNode[];
}

export interface CommandOptNode extends Node {
  type: NodeType.CommandOpt;
  name: string;
  value: ArgumentExpressionNode;
}

export interface BlockExpressionNode extends Node {
  type: NodeType.BlockExpression;
  body: Node[];
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
  operator: '+' | '-' | '*' | '/';
  left: OperableExpressionNode;
  right: OperableExpressionNode;
}

export type LiteralExpressionNode =
  | AddressLiteralNode
  | BooleanLiteralNode
  | BytesLiteralNode
  | NumericLiteralNode
  | StringLiteralNode;

export type PrimaryExpressionNode =
  | LiteralExpressionNode
  | ProbableIdentifierNode
  | VariableIdentiferNode;

export type ArgumentExpressionNode =
  | BinaryExpressionNode
  | ArrayExpressionNode
  | CallExpressionNode
  | HelperFunctionNode
  | PrimaryExpressionNode;

export type CommandArgExpressionNode =
  | AsExpressionNode
  | ArgumentExpressionNode
  | BlockExpressionNode;

export type AST = {
  type: ASTType;

  body: Node[];
};
