import type { Signer } from 'ethers';

import type { LazyNode } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import { IPFSResolver } from '../../../IPFSResolver';
import { exec, load, set } from './commands';
import { helpers } from './helpers';
import type { CommandFunction } from '../../types';

export class Std extends Module {
  #modules: Module[];
  #ipfsResolver: IPFSResolver;

  constructor(
    bindingsManager: BindingsManager,
    signer: Signer,
    modules: Module[],
  ) {
    super('std', bindingsManager, signer, helpers);

    this.#ipfsResolver = new IPFSResolver();
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }

  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }

  async interpretCommand(
    name: string,
    lazyNodes: LazyNode[],
  ): ReturnType<CommandFunction<Std>> {
    switch (name) {
      case 'load':
        return load(this, lazyNodes);
      case 'exec':
        return exec(this, lazyNodes);
      case 'set':
        return set(this, lazyNodes);
      default:
        this.panic(`Command ${name} not found on module Std`);
    }
  }
}
