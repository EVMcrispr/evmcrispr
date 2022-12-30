import type {
  Address,
  BindingsManager,
  EVMcrispr,
  IPFSResolver,
} from '@1hive/evmcrispr';
import {
  BindingsSpace,
  ErrorNotFound,
  Module,
  addressesEqual,
  buildNonceForAddress,
  calculateNewProxyAddress,
} from '@1hive/evmcrispr';

import type { AragonDAO } from './AragonDAO';
import { commands } from './commands';
import { helpers } from './helpers';

export class AragonOS extends Module {
  #connectedDAOs: AragonDAO[];

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      'aragonos',
      bindingsManager,
      nonces,
      commands,
      helpers,
      evmcrispr,
      ipfsResolver,
      alias,
    );

    this.#connectedDAOs = [];
  }

  get connectedDAOs(): AragonDAO[] {
    return this.#connectedDAOs;
  }

  get currentDAO(): AragonDAO | undefined {
    return this.bindingsManager.getBindingValue(
      'currentDAO',
      BindingsSpace.DATA_PROVIDER,
    ) as AragonDAO | undefined;
  }

  set currentDAO(dao: AragonDAO | undefined) {
    if (!dao) {
      return;
    }

    this.bindingsManager.setBinding(
      'currentDAO',
      dao,
      BindingsSpace.DATA_PROVIDER,
    );
  }

  getConnectedDAO(daoAddress: Address): AragonDAO | undefined {
    return this.connectedDAOs.find((dao) =>
      addressesEqual(dao.kernel.address, daoAddress),
    );
  }

  async registerNextProxyAddress(
    identifier: string,
    daoAddress: Address,
  ): Promise<string> {
    const connectedDAO = this.getConnectedDAO(daoAddress);

    if (!connectedDAO) {
      throw new ErrorNotFound(`couldn't found DAO ${daoAddress}`);
    }

    const kernel = connectedDAO.resolveApp('kernel')!;
    const nonce = await buildNonceForAddress(
      kernel.address,
      await this.incrementNonce(kernel.address),
      await this.getProvider(),
    );

    const addr = calculateNewProxyAddress(kernel.address, nonce);
    this.bindingsManager.setBinding(identifier, addr, BindingsSpace.ADDR);
    return addr;
  }
}
