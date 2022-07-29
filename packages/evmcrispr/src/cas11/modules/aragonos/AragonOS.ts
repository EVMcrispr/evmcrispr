import type { Signer } from 'ethers';

import type { LazyNode } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import type { IPFSResolver } from '../../../IPFSResolver';
import type { AragonDAO } from './AragonDAO';
import type { CommandFunction } from '../../types';
import { act, connect } from './commands';

export class AragonOS extends Module {
  #ipfsResolver: IPFSResolver;

  constructor(
    bindingsManager: BindingsManager,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super('aragonos', bindingsManager, alias);

    this.#ipfsResolver = ipfsResolver;
  }

  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }

  async interpretCommand(
    name: string,
    lazyNodes: LazyNode[],
    signer: Signer,
  ): ReturnType<CommandFunction<AragonOS>> {
    switch (name) {
      case 'connect':
        return connect(this, lazyNodes, signer);
      case 'act':
        return act(this, lazyNodes);
      default:
        this.panic(`Command ${name} not found on module AragonOS`);
    }
  }

  getCurrentDAO(): AragonDAO {
    return this.getModuleVariable('currentDAO') as AragonDAO;
  }
}
