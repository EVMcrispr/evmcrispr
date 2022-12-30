import type { providers } from 'ethers';

import type { Action } from './actions';
import type {
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
  Position,
} from './ast';
import type { BindingsManager } from '../BindingsManager';
import type { IPFSResolver } from '../IPFSResolver';
import type { Module } from '../Module';
import type { LazyBindings } from './bindings';
import type { EVMcrispr } from '..';

export interface InterpretOptions {
  allowNotFoundError: boolean;
  treatAsLiteral: boolean;
  blockModule: string;
  blockInitializer?(): Promise<void>;
  actionCallback?(action: Action): Promise<void>;
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
  actionCallback?(action: Action): Promise<void>;
};

export type CommandFunction<T extends Module> = (
  module: T,
  c: CommandExpressionNode,
  interpreters: NodesInterpreters,
) => Promise<Action[] | void>;
export type HelperFunction<T> = (
  module: T,
  h: HelperFunctionNode,
  interpreters: NodesInterpreters,
) => Promise<string>;
export type HelperFunctions<T = Module> = Record<string, HelperFunction<T>>;

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
    fetchers: { ipfsResolver: IPFSResolver; provider: providers.Provider },
    caretPos: Position,
    closestCommandToCaret: boolean,
  ): Promise<LazyBindings | void>;
}
export type Commands<T extends Module = Module> = Record<string, ICommand<T>>;

export interface ModuleExports<T extends Module = Module> {
  ModuleConstructor: Module['constructor'];
  commands: Commands<T>;
  helpers: HelperFunctions<T>;
}

export interface IDataProvider {
  readonly type: string;
  clone(): IDataProvider;
}

export interface IModuleConstructor {
  new (
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ): Module;
}
