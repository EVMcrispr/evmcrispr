import type { providers } from 'ethers';
import { BigNumber, Wallet, utils } from 'ethers';

import type { Address } from '../types';

export const SIGNATURE_REGEX = /\w+\(((\w+(\[\d*\])*)+(,\w+(\[\d*\])*)*)?\)/;

export async function buildNonceForAddress(
  address: Address,
  index: number,
  provider: providers.Provider,
): Promise<string> {
  const txCount = await provider.getTransactionCount(address);
  return utils.hexlify(txCount + index);
}

/**
 * Calculates the next created address by the kernel
 * @dev see https://ethereum.stackexchange.com/questions/760/how-is-the-address-of-an-ethereum-contract-computed/761#761
 * @param {*} daoAddress address of the kernel
 * @param {*} nonce address nonce
 * @returns {string} conterfactual address
 */
export function calculateNewProxyAddress(
  daoAddress: Address,
  nonce: string,
): Address {
  const rlpEncoded = utils.RLP.encode([utils.hexlify(daoAddress), nonce]);
  const contractAddressLong = utils.keccak256(rlpEncoded);
  const contractAddress = `0x${contractAddressLong.substr(-40)}`;

  return contractAddress;
}

export const toDecimals = (
  amount: number | string,
  decimals = 18,
): BigNumber => {
  const [integer, decimal] = String(amount).split('.');
  return BigNumber.from(
    (integer != '0' ? integer : '') + (decimal || '').padEnd(decimals, '0') ||
      '0',
  );
};

export function addressesEqual(first: Address, second: Address): boolean {
  first = first && first.toLowerCase();
  second = second && second.toLowerCase();
  return first === second;
}

export const getRandomAddress = (): Address => {
  return Wallet.createRandom().address;
};
