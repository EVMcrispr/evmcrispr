export { ErrorException, ErrorInvalid, ErrorNotFound } from "./errors";
export type { ErrorOptions } from "./errors";
export {
  ASTType,
  NodeType,
  BindingsSpace,
  isProviderAction,
  isSwitchAction,
} from "./types";
export type {
  Action,
  TransactionAction,
  ProviderAction,
  Address,
  Abi,
  AST,
  Node,
  Position,
  Location,
  LiteralExpression,
  AddressLiteralNode,
  BytesLiteralNode,
  StringLiteralNode,
  BooleanLiteralNode,
  NumericLiteralNode,
  ArrayExpressionNode,
  ProbableIdentifierNode,
  VariableIdentifierNode,
  CallExpressionNode,
  HelperFunctionNode,
  CommandExpressionNode,
  CommandOptNode,
  BlockExpressionNode,
  AsExpressionNode,
  OperableExpressionNode,
  BinaryExpressionNode,
  NodeWithArguments,
  LiteralExpressionNode,
  PrimaryExpressionNode,
  ArgumentExpressionNode,
  CommandArgExpressionNode,
  Nullable,
  IBinding,
  NoNullableBinding,
  ModuleData,
  AddressBinding,
  AbiBinding,
  ModuleBinding,
  UserBinding,
  AliasBinding,
  DataProviderBinding,
  OtherBinding,
  LazyBindings,
  Binding,
  NullableBinding,
  RelativeBinding,
  RelativeNullableBinding,
  InterpretOptions,
  NodeInterpreter,
  NodesInterpreter,
  NodesInterpreters,
  CommandFunction,
  HelperFunction,
  HelperFunctions,
  ICommand,
  Commands,
  ModuleExports,
  IDataProvider,
  IModuleConstructor,
  LocationData,
  NodeParserState,
  NodeParser,
  EnclosingNodeParser,
} from "./types";

export { Module } from "./Module";
export {
  ModuleConstructor as StdConstructor,
  commands as stdCommands,
  helpers as stdHelpers,
} from "./modules/std";

export { BindingsManager } from "./BindingsManager";

export { Cas11AST } from "./Cas11AST";
export { EVMcrispr } from "./EVMcrispr";
export { IPFS_GATEWAY, IPFSResolver } from "./IPFSResolver";

export {
  insideNodeLine,
  insideNode,
  inSameLineThanNode,
  beforeOrEqualNode,
  calculateCurrentArgIndex,
  hasCommandsBlock,
  getDeepestNodeWithArgs,
  interpretNodeSync,
  isAddressNodishType,
  isNodeWithArgs,
} from "./utils/ast";

export { scriptParser, parseScript } from "./parsers/script";
