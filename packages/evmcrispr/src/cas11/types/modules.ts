import type { Action } from '../..';
import type { Module } from '../modules/Module';
import type { CommandExpressionNode, HelperFunctionNode, Node } from './ast';

export interface InterpretOptions {
  treatAsLiteral: boolean;
  blockModule: string;
  blockInitializer?(): Promise<void>;
  identifierFormatter?(identifier: string): string;
}

export type NodeInterpreter<T extends Node = Node> = (
  n: T,
  options?: Partial<InterpretOptions>,
) => Promise<any>;
export type NodesInterpreter = (
  nodes: Node[],
  sequentally?: boolean,
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
export type CommandFunctions<T extends Module> = Record<
  string,
  CommandFunction<T>
>;

export type HelperFunction<T> = (
  module: T,
  h: HelperFunctionNode,
  interpreters: NodesInterpreters,
) => Promise<string>;
export type HelperFunctions<T> = Record<string, HelperFunction<T>>;
