export enum ASTType {
  Program = "Program",
}

export enum NodeType {
  AddressLiteral = "AddressLiteral",
  BoolLiteral = "BoolLiteral",
  BytesLiteral = "BytesLiteral",
  NumberLiteral = "NumberLiteral",
  StringLiteral = "StringLiteral",

  ArrayExpression = "ArrayExpression",
  BlockExpression = "BlockExpression",
  CallExpression = "CallExpression",
  CommandExpression = "CommandExpression",
  HelperFunctionExpression = "HelperFunctionExpression",

  Bareword = "Bareword",
  VariableIdentifier = "VariableIdentifier",

  DestructurePattern = "DestructurePattern",

  CommandOpt = "CommandOpt",
  EventCapture = "EventCapture",
  ErrorCapture = "ErrorCapture",
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
  /** Sentinel of the heredoc form (`<<<SOL … SOL`) the literal was written
   *  in, when it was; content is raw (no escape processing). */
  heredoc?: string;
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
  /** Rate literal (`1000e18/mo`): divide by the time unit instead of multiplying. */
  perTime?: boolean;
}

export interface ArrayExpressionNode extends Node {
  type: NodeType.ArrayExpression;
  elements: Node[];
}

export interface BarewordNode extends Node {
  type: NodeType.Bareword;
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
  /** Inline ABI input types, e.g. "(address)" — from ::{method(inputs)(outputs)} syntax. */
  inputTypes?: string;
  /** Inline ABI output types, e.g. "(uint256)" — from ::{method(inputs)(outputs)} syntax. */
  outputTypes?: string;
  /** Positional lens applied to the return value. `"$"` = take, `null` = skip, array = descend. */
  returnDestructure?: DestructureSlot[];
}

export interface HelperFunctionNode extends Node {
  type: NodeType.HelperFunctionExpression;
  /** Module namespace from `@module:name(...)` syntax. Absent = unqualified. */
  module?: string;
  name: string;
  args: ArgumentExpressionNode[];
  /** Rename target from `@name>@newName` — only meaningful inside a `load`
   *  import list; a semantic error anywhere else. */
  rename?: string;
}

/** Recursive destructure slot: variable name, hole (null), or nested pattern. */
export type DestructureSlot = string | null | DestructureSlot[];

export interface DestructurePatternNode extends Node {
  type: NodeType.DestructurePattern;
  /** Each slot is a variable name (with $), null (hole/skip), or nested pattern. */
  slots: DestructureSlot[];
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
  /** Positional capture slots (variable names without $, null = skip, array = nested). */
  captures: DestructureSlot[];
}

export interface ErrorCaptureNode extends Node {
  type: NodeType.ErrorCapture;
  /** Error name (e.g. "InsufficientBalance"). Undefined = generic catch-all. */
  errorName?: string;
  /** Inline error param types from ErrorName(uint,address) syntax. */
  errorParams?: string[];
  /** If true, this is -?!> (optional -- no error is not a failure). */
  optional: boolean;
  /** Positional capture slots (variable names without $, null = skip, array = nested). */
  captures: DestructureSlot[];
  /** Variable name (without $) for boolean capture — mutually exclusive with captures. */
  boolVar?: string;
}

export interface CommandExpressionNode extends Node {
  type: NodeType.CommandExpression;
  module?: string;
  name: string;
  args: Node[];
  opts: CommandOptNode[];
  eventCaptures?: EventCaptureNode[];
  errorCaptures?: ErrorCaptureNode[];
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
  | BarewordNode
  | VariableIdentifierNode;

export type ArgumentExpressionNode =
  | ArrayExpressionNode
  | DestructurePatternNode
  | CallExpressionNode
  | HelperFunctionNode
  | PrimaryExpressionNode;

export type CommandArgExpressionNode =
  | ArgumentExpressionNode
  | BlockExpressionNode
  | CommandOptNode;

export interface AST {
  type: ASTType;
  body: Node[];
}
