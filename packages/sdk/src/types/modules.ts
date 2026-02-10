import type { Address, PublicClient } from "viem";
import type { BindingsManager } from "../BindingsManager";
import type { IPFSResolver } from "../IPFSResolver";
import type { Module } from "../Module";
import type { Action } from "./actions";
import type {
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
  Position,
} from "./ast";
import type { LazyBindings } from "./bindings";

/**
 * Narrow context object passed to every module instead of the full EVMcrispr
 * instance.  Contains only the services a module actually needs.
 */
export interface ModuleContext {
  readonly bindingsManager: BindingsManager;
  readonly nonces: Record<string, number>;
  readonly ipfsResolver: IPFSResolver;

  /** Shared mutable array of loaded non-std modules. */
  readonly modules: Module[];

  // Client / chain access
  getClient(): Promise<PublicClient>;
  getChainId(): Promise<number>;
  switchChainId(chainId: number): Promise<PublicClient>;
  getConnectedAccount(retreiveInjected?: boolean): Promise<Address>;

  // Mutation helpers used by fork / sim commands
  setClient(client: PublicClient | undefined): void;
  setConnectedAccount(account: Address | undefined): void;

  // Logging
  log(message: string): void;

  // Module registry (implemented by the runtime)
  /** Load a module by name from the pluggable registry. */
  loadModule(name: string): Promise<{ default: IModuleConstructor }>;
  /** List available (registered) module names for autocompletion. */
  getAvailableModuleNames(): string[];
}

export interface InterpretOptions {
  allowNotFoundError: boolean;
  treatAsLiteral: boolean;
  blockModule: string;
  blockInitializer?(): Promise<void>;
  actionCallback?(action: Action): Promise<unknown>;
}

export type NodeInterpreter<T extends Node = Node> = (
  n: T,
  options?: Partial<InterpretOptions>,
) => Promise<any>;
export type NodesInterpreter = (
  nodes: Node[],
  sequentally?: boolean,
  options?: Partial<InterpretOptions>,
) => Promise<any[]>;
export type NodesInterpreters = {
  interpretNode: NodeInterpreter;
  interpretNodes: NodesInterpreter;
  actionCallback?(action: Action): Promise<unknown>;
};

export type CommandFunction<T extends Module> = (
  module: T,
  c: CommandExpressionNode,
  interpreters: NodesInterpreters,
) => Promise<Action[] | void>;
export type HelperFunction<T = Module> = (
  module: T,
  h: HelperFunctionNode,
  interpreters: NodesInterpreters,
) => Promise<string>;

/** Lazy loader: () => Promise<HelperFunction>. Resolved on first use. */
export type HelperLoader<M extends Module = Module> = () => Promise<
  HelperFunction<M>
>;

/** Helper is either eager (HelperFunction) or lazy (HelperLoader). */
export type HelperOrLoader<M extends Module = Module> =
  | HelperFunction<M>
  | HelperLoader<M>;

export type HelperFunctions<T extends Module = Module> = Record<
  string,
  HelperOrLoader<T>
>;

export interface ICommand<M extends Module = Module> {
  buildCompletionItemsForArg(
    argIndex: number,
    nodeArgs: Node[],
    bindingsManager: BindingsManager,
    caretPos: Position,
  ): string[];
  run: CommandFunction<M>;
  runEagerExecution(
    c: CommandExpressionNode,
    cache: BindingsManager,
    fetchers: { ipfsResolver: IPFSResolver; client: PublicClient },
    caretPos: Position,
    closestCommandToCaret: boolean,
  ): Promise<LazyBindings | void>;
}

/** Lazy loader: () => Promise<ICommand>. Resolved on first use. */
export type CommandLoader<M extends Module = Module> = () => Promise<
  ICommand<M>
>;

/** Command is either eager (ICommand) or lazy (CommandLoader). */
export type CommandOrLoader<M extends Module = Module> =
  | ICommand<M>
  | CommandLoader<M>;

export type Commands<T extends Module = Module> = Record<
  string,
  CommandOrLoader<T>
>;

export async function resolveCommand<M extends Module = Module>(
  commandOrLoader: CommandOrLoader<M>,
): Promise<ICommand<M>> {
  return typeof commandOrLoader === "function"
    ? commandOrLoader()
    : commandOrLoader;
}

export async function resolveHelper<M extends Module = Module>(
  helperOrLoader: HelperOrLoader<M>,
): Promise<HelperFunction<M>> {
  // Loaders are 0-arity; helper functions have 3+ params
  if (helperOrLoader.length === 0) {
    return (helperOrLoader as HelperLoader<M>)();
  }
  return helperOrLoader as HelperFunction<M>;
}

/** Map of name -> lazy dynamic import that yields an ICommand as default export. */
export type CommandImportMap = Record<
  string,
  () => Promise<{ default: ICommand<any> }>
>;

/** Map of name -> lazy dynamic import that yields a HelperFunction as default export. */
export type HelperImportMap = Record<
  string,
  () => Promise<{ default: HelperFunction<any> }>
>;

export interface ModuleExports<T extends Module = Module> {
  default: IModuleConstructor;
  commands: Commands<T>;
  helpers: HelperFunctions<T>;
}

export interface IDataProvider {
  readonly type: string;
  clone(): IDataProvider;
}

export interface IModuleConstructor {
  new (context: ModuleContext, alias?: string): Module;
}
