import type { Binding, BindingsManager } from '../BindingsManager';
import type { Action } from '../types';
import type { Module } from '../Module';
import type { CommandExpressionNode, HelperFunctionNode, Node } from './ast';

export interface InterpretOptions {
  allowNotFoundError: boolean;
  treatAsLiteral: boolean;
  blockModule: string;
  blockInitializer?(): Promise<void>;
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

export interface ICommand<T extends Module = Module> {
  buildCompletionItemsForArg?(
    argIndex: number,
    nodeArgs: Node[],
    cache: BindingsManager,
  ): (string | number)[];
  run: CommandFunction<T>;
  runEagerExecution?(
    nodeArgs: Node[],
    cache: BindingsManager,
  ): Promise<Binding | undefined>;
}
export type Commands<T extends Module = Module> = Record<string, ICommand<T>>;

export interface ModuleExports<T extends Module = Module> {
  ModuleConstructor: Module['constructor'];
  commands: Commands<T>;
  helpers: HelperFunctions<T>;
}
