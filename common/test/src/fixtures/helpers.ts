import type { Permission } from '@1hive/evmcrispr-aragonos-module';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

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

export const getSigner = async (): Promise<SignerWithAddress> => {
  const signer = (await ethers.getSigners())[0];

  signer.provider!.getTransactionCount = (): Promise<number> => {
    return new Promise((resolve) => {
      resolve(KERNEL_TRANSACTION_COUNT);
    });
  };

  return signer;
};
