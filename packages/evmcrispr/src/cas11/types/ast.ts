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

export interface LiteralExpressionNode extends Node {
  type: LiteralExpression;
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
  name: string;
  args: Node[];
  body?: Node[];
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
