import type { Signer } from 'ethers';

import type { BindingsManager } from '../../BindingsManager';

import { Module } from '../../Module';
import { IPFSResolver } from '../../IPFSResolver';
import { commands } from './commands';
import { helpers } from './helpers';

export class Std extends Module {
  #modules: Module[];
  #ipfsResolver: IPFSResolver;

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    signer: Signer,
    modules: Module[],
  ) {
    super('std', bindingsManager, nonces, commands, helpers, signer);

    this.#ipfsResolver = new IPFSResolver();
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }

  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }
}
