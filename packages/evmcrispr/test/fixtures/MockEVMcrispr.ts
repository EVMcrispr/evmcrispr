import type { IpfsResolver } from '@1hive/connect-core';
import type { Signer } from 'ethers';

import { KERNEL_TRANSACTION_COUNT } from '.';
import type { Address, EVMcrisprOptions } from '../../src';
import { EVMcrispr } from '../../src';
import { IPFS_GATEWAY } from '../../src/helpers';
import MockConnector from './MockConnector';

const mockIpfsResolver: IpfsResolver = {
  json: (cid: string): Promise<any> => {
    return new Promise((resolve) => {
      import(`./artifacts/${cid}`).then(resolve);
    });
  },
  url: (): Promise<string> => new Promise((resolve) => resolve('')),
};

class MockEVMcrispr extends EVMcrispr {
  constructor(chainId: number, signer: Signer, options: EVMcrisprOptions) {
    super(chainId, signer, options);
    this._connector = new MockConnector(chainId);
    this._ipfsResolver = mockIpfsResolver;
  }

  static async create(
    daoAddress: Address,
    signer: Signer,
    options: EVMcrisprOptions = { ipfsGateway: IPFS_GATEWAY },
  ): Promise<MockEVMcrispr> {
    const mockevmcrispr = new MockEVMcrispr(
      await signer.getChainId(),
      signer,
      options,
    );

    // Overwrite async method needed for building the app cache
    signer.provider!.getTransactionCount = (): Promise<number> => {
      return new Promise((resolve) => {
        resolve(KERNEL_TRANSACTION_COUNT);
      });
    };

    await mockevmcrispr._connect(daoAddress);

    return mockevmcrispr;
  }
}

export default MockEVMcrispr;
