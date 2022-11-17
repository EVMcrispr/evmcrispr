import type { BindingsManager } from '../../BindingsManager';

import { Module } from '../../Module';
import type { IPFSResolver } from '../../IPFSResolver';
import { commands } from './commands';
import { helpers } from './helpers';
import type { EVMcrispr } from '../../EVMcrispr';

export class Std extends Module {
  #modules: Module[];

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    modules: Module[],
  ) {
    super(
      'std',
      bindingsManager,
      nonces,
      commands,
      helpers,
      evmcrispr,
      ipfsResolver,
    );

    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }
}
