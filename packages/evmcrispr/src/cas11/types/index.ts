import type { Action } from '../..';
import type { LazyNode } from '../interpreter/Interpreter';
import type { Module } from '../modules/Module';

export * from './ast';
export * from './parsers';

export type CommandFunction<T extends Module> = (
  module: T,
  lazyNodes: LazyNode[],
) => Promise<Action[] | void>;

export type HelperFunction = (...args: any[]) => Promise<string>;
export type HelperFunctions = Record<string, HelperFunction>;

export type RawHelperFunction<T extends Module> = (
  module: T,
  ...args: Parameters<HelperFunction>
) => ReturnType<HelperFunction>;

export type RawHelperFunctions<T extends Module> = Record<
  string,
  RawHelperFunction<T>
>;
