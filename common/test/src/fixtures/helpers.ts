import type { Permission } from '@1hive/evmcrispr-aragonos-module';
import type { Signer } from 'ethers';
import { Wallet, utils } from 'ethers';

import { DAO } from '.';
import { KERNEL_TRANSACTION_COUNT } from './mock-dao';

export const resolvePermission = (permission: Permission): Permission => {
  return permission.map((element, index) => {
    // Last element is the role
    if (index === permission.length - 1) {
      return utils.id(element);
    }

    return utils.isAddress(element)
      ? element
      : DAO[element as keyof typeof DAO];
  }) as Permission;
};

export const getSignatureSelector = (signature: string): string => {
  return signature.split('(')[0];
};

export const getSigner = async (): Promise<Signer> => {
  const wallet = Wallet.fromMnemonic(
    'test test test test test test test test test test test junk',
  );

  wallet.provider!.getTransactionCount = (): Promise<number> => {
    return new Promise((resolve) => {
      resolve(KERNEL_TRANSACTION_COUNT);
    });
  };

  return wallet;
};
