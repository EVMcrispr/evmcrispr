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
  BinaryExpression = 'BinaryExpression',
  BlockExpression = 'BlockExpression',
  CallExpression = 'CallExpression',
  CommandExpression = 'CommandExpression',
  GroupingExpression = 'GroupingExpression',
  HelperFunctionExpression = 'HelperFunctionExpression',
  UnaryExpression = 'UnaryExpression',

  Identifier = 'Identifier',
  VariableIdentifier = 'VariableIdentifier',
}

export type LiteralExpression =
  | NodeType.AddressLiteral
  | NodeType.BoolLiteral
  | NodeType.BytesLiteral
  | NodeType.NumberLiteral
  | NodeType.StringLiteral;

export interface Node {
  type: NodeType;
  value?: any;
}

export type LiteralExpressionNode =
  | AddressLiteralNode
  | BooleanLiteralNode
  | BytesLiteralNode
  | NumericLiteralNode
  | StringLiteralNode;

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

export interface GroupingExpressionNode extends Node {
  type: NodeType.GroupingExpression;
  expression: Node;
}

export interface IdentifierNode extends Node {
  type: NodeType.Identifier;
  value: string;
}

export interface VariableIdentiferNode extends Node {
  type: NodeType.VariableIdentifier;
  value: string;
}

export interface CallExpressionNode extends Node {
  type: NodeType.CallExpression;
  callee: Node;
  args: Node[];
}

export interface HelperFunctionNode extends Node {
  type: NodeType.HelperFunctionExpression;
  name: string;
  args: Node[];
}

export interface CommandExpressionNode extends Node {
  type: NodeType.CommandExpression;
  name: Node;
  args: Node[];
  body?: Node[];
}

export interface BlockExpressionNode extends Node {
  type: NodeType.BlockExpression;
  body: Node[];
}

export interface AsExpressionNode extends Node {
  type: NodeType.AsExpression;
  left: IdentifierNode;
  right: IdentifierNode;
}

export type AST = {
  type: string;

  body: Node[];
};
