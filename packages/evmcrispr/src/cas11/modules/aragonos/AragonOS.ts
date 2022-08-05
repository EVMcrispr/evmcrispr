import type { Signer } from 'ethers';

import type { LazyNode } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import type { IPFSResolver } from '../../../IPFSResolver';
import type { CommandFunction } from '../../types';
import { ErrorInvalid } from '../../../errors';
import type { AragonDAO } from './AragonDAO';
import { commands } from './commands';
import { helpers } from './helpers';
import { addressesEqual } from '../../../utils';
import type { Address } from '../../..';

export class AragonOS extends Module {
  #ipfsResolver: IPFSResolver;
  #connectedDAOs: AragonDAO[];

  constructor(
    bindingsManager: BindingsManager,
    signer: Signer,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super('aragonos', bindingsManager, signer, helpers, alias);

    this.#connectedDAOs = [];
    this.#ipfsResolver = ipfsResolver;
  }

  get connectedDAOs(): AragonDAO[] {
    return this.#connectedDAOs;
  }
  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }

  async interpretCommand(
    name: string,
    lazyNodes: LazyNode[],
  ): ReturnType<CommandFunction<AragonOS>> {
    const command = commands[name];

    if (!command) {
      throw new ErrorInvalid(`Command ${name} not found on module AragonOS`);
    }

    return command(this, lazyNodes);
  }

  getConnectedDAO(daoAddress: Address): AragonDAO | undefined {
    return this.connectedDAOs.find((dao) =>
      addressesEqual(dao.kernel.address, daoAddress),
    );
  }

  getCurrentDAO(): AragonDAO | undefined {
    return this.getModuleBinding('currentDAO') as AragonDAO | undefined;
  }

  setCurrentDAO(dao: AragonDAO): void {
    this.setModuleBinding('currentDAO', dao);
  }
}
