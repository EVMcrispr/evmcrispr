import type { Address, Chain, PublicClient, Transport } from "viem";
import type { BindingsManager } from "../BindingsManager";
import type { IPFSResolver } from "../IPFSResolver";
import type { Module } from "../Module";
import type { Param } from "../utils/encoders";
import type { ArgDef, ArgType, OptDef } from "../utils/schema";
import type { Action } from "./actions";
import type {
  AST,
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
} from "./ast";
import type { CompletionOverrides } from "./completions";

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
  /** Return the full Chain object for the current chain, if known. */
  getChain(): Promise<Chain | undefined>;
  switchChainId(chainId: number): PublicClient;
  getConnectedAccount(retreiveInjected?: boolean): Promise<Address>;

  /** Get a Transport for the given chain, using configured RPC endpoints. */
  getTransport(chainId: number): Transport;

  // Mutation helpers used by fork / sim commands
  setClient(client: PublicClient): void;
  setConnectedAccount(account: Address | undefined): void;

  // Logging
  log(message: string): void;

  /** Abort signal for the current run, when the caller provided one.
   *  Long-running commands should check it between steps. */
  readonly signal?: AbortSignal;

  // Module registry (implemented by the runtime)
  /** Load a module by name from the pluggable registry. */
  loadModule(name: string): Promise<{ default: IModuleConstructor }>;
  /** List available (registered) module names for autocompletion. */
  getAvailableModuleNames(): string[];

  /** Parse EVML source into an AST. Provided by the runtime; used by
   *  `load --from` to parse external module files. */
  parseEvml(script: string): { ast: AST; errors: string[] };

  /** The std module instance, when the host runtime provides one (the
   *  execution interpreter does; analysis surfaces need not). Lets the
   *  on-chain helper dispatch fall back to std the same way the
   *  interpreter's unqualified-helper resolution does. */
  getStd?(): Module | undefined;
}

/** Who is executing the current nodes: the user's script (default) or a
 *  def body of an EVML-defined module. Controls config-var access and the
 *  scope `set` binds into. */
export type ExecutionOrigin =
  | { kind: "user" }
  | { kind: "module"; module: string };

export const USER_ORIGIN: ExecutionOrigin = { kind: "user" };

/** State of an enclosing atomic batch context (`batch`, `connect`,
 *  `forward`). Non-batchable commands are rejected while it is set.
 *  Chain-state reads (non-batchable helpers, inline `addr::fn()` calls)
 *  are only rejected once the batch has collected actions: before that,
 *  build-time state equals execution-time state, so reading it into
 *  variables at the beginning of the batch is sound (and encouraged). */
export interface BatchContext {
  /** Name of the batch-like command, used in error messages. */
  name: string;
  /** Whether the batch has already collected transaction actions. */
  hasActions: boolean;
  /** Smart batch: the block compiles to a single on-chain composable
   *  execution instead of a build-time action list, so compile-faced
   *  helpers evaluate on-chain, in sequence — the non-batchable gate does
   *  not apply. Nothing sets this yet (reserved for the executeComposable
   *  smart-batch compiler). */
  smart?: boolean;
}

export interface InterpretOptions {
  blockInitializer?(): Promise<void>;
  actionCallback?(action: Action): Promise<unknown>;
  /** The enclosing atomic batch context, if any. */
  batchContext?: BatchContext;
  /** Execution origin of the nodes being interpreted (defaults to user). */
  origin?: ExecutionOrigin;
  /** True when the nodes run inside a simulated fork (`sim:fork`). Commands
   *  with off-chain side effects (API writes, wallet signatures) must skip
   *  them when set — the chain is fake but the side effects would be real. */
  simulation?: boolean;
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
  /** The enclosing atomic batch context, if any. */
  batchContext?: BatchContext;
  /** Execution origin of the running command/helper (defaults to user). */
  origin?: ExecutionOrigin;
  /** True inside a simulated fork (`sim:fork`) — skip real-world side
   *  effects (API writes, wallet signatures). */
  simulation?: boolean;
};

export type CommandFunction<T extends Module = Module> = (
  module: T,
  c: CommandExpressionNode,
  interpreters: NodesInterpreters,
) => Promise<Action[] | void>;
export type HelperFunction<T = Module> = (
  module: T,
  h: HelperFunctionNode,
  interpreters: NodesInterpreters,
) => Promise<Param>;

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

/** Whether a command may run inside an atomic batch context
 *  (batch / connect / forward). Default true. A function receives the
 *  parsed args and opts; return true, false, or a string reason. */
export type BatchableSpec =
  | boolean
  | ((
      args: Record<string, any>,
      opts: Record<string, any>,
    ) => boolean | string);

export interface ICommand<M extends Module = Module> {
  run: CommandFunction<M>;
  argDefs: ArgDef[];
  optDefs: OptDef[];
  /** Override type-driven completions for specific args or opts by name. */
  completions?: CompletionOverrides;
  /** Human-readable description shown in hover tooltips. */
  description?: string;
  /** Whether this command may run inside an atomic batch context. */
  batchable?: BatchableSpec;
  /** Whether this command opens an atomic batch context around its block
   *  body (`batch`, `connect`, `forward`). */
  createsBatchContext?: boolean;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
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

/** Entry in a command import map: lazy loader + optional metadata. */
export type CommandImportEntry = {
  load: () => Promise<{ default: ICommand<any> }>;
  /** Human-readable description shown in completions and hover tooltips. */
  description?: string;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
};

/** Map of name -> command import entry (loader + optional metadata). */
export type CommandImportMap = Record<string, CommandImportEntry>;

/** Simplified arg definition stored in import metadata (no functions). */
export type HelperArgDefEntry = {
  name: string;
  type: string | string[];
  optional?: boolean;
  rest?: boolean;
  /** Only fillable by name (`name:value`), never positionally. */
  namedOnly?: boolean;
  /** Human-readable description for documentation. */
  description?: string;
};

/** Entry in a helper import map: lazy loader + optional metadata. */
export type HelperImportEntry = {
  load: () => Promise<{ default: HelperFunction<any> }>;
  returnType?: ArgType;
  hasArgs?: boolean;
  argDefs?: HelperArgDefEntry[];
  /** Human-readable description shown in hover tooltips. */
  description?: string;
  /** Only available when `VITE_PUBLIC_EXPERIMENTAL` is enabled. */
  experimental?: boolean;
  /** This key is a helper's on-chain face (`name!`, registered by codegen
   *  when the definition declares a `compile` face). */
  onchain?: boolean;
  /** The definition's `batchable` flag (only recorded when `false`), so
   *  the analyzer can gate batch use without dynamically importing the
   *  helper. */
  batchable?: boolean;
};

/** Map of name -> helper import entry (loader + return type). */
export type HelperImportMap = Record<string, HelperImportEntry>;

export interface ModuleExports<T extends Module = Module> {
  default: IModuleConstructor;
  commands: Commands<T>;
  helpers: HelperFunctions<T>;
}

export interface IModuleConstructor {
  new (context: ModuleContext): Module;
  /** Module name as registered in the language (`load <moduleName>`). */
  readonly moduleName: string;
  /** Human-readable module description, surfaced in completions. */
  readonly moduleDescription?: string;
}
