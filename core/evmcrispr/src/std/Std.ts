import type { BindingsManager } from '../BindingsManager';
import type { EVMcrispr } from '../EVMcrispr';
import type { IPFSResolver } from '../IPFSResolver';
import { Module } from '../Module';
import { commands } from './commands';
import { helpers } from './helpers';

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
