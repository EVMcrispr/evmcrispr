import type { Signer } from 'ethers';

import type { LazyNode } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import { IPFSResolver } from '../../../IPFSResolver';
import { commands } from './commands';
import { helpers } from './helpers';
import type { CommandFunction } from '../../types';
import { ErrorInvalid } from '../../../errors';

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
    const command = commands[name];

    if (!command) {
      throw new ErrorInvalid(`Command ${name} not found on module Std`);
    }

    return command(this, lazyNodes);
  }
}
