import type { Signer } from 'ethers';

import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import type { IPFSResolver } from '../../../IPFSResolver';
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
    nonces: Record<string, number>,
    signer: Signer,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      'aragonos',
      bindingsManager,
      nonces,
      commands,
      helpers,
      signer,
      alias,
    );

    this.#connectedDAOs = [];
    this.#ipfsResolver = ipfsResolver;
  }

  get connectedDAOs(): AragonDAO[] {
    return this.#connectedDAOs;
  }

  get currentDAO(): AragonDAO | undefined {
    return this.getModuleBinding('currentDAO') as AragonDAO | undefined;
  }

  set currentDAO(dao: AragonDAO | undefined) {
    this.setModuleBinding('currentDAO', dao);
  }

  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }

  getConnectedDAO(daoAddress: Address): AragonDAO | undefined {
    return this.connectedDAOs.find((dao) =>
      addressesEqual(dao.kernel.address, daoAddress),
    );
  }
}
