import type { Signer } from 'ethers';

import type { Action } from '../..';
import type { LazyNode } from '../interpreter/Interpreter';
import type { Module } from '../modules/Module';

export * from './ast';

export type CommandFunction<T extends Module> = (
  module: T,
  lazyNodes: LazyNode[],
  signer?: Signer,
) => Promise<Action[] | void>;
