import type { Address } from '@1hive/connect-core';
import type { providers } from 'ethers';
import { BigNumber, Contract, ethers, utils } from 'ethers';
import type { Interface } from '@ethersproject/abi';

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

export function getFunctionParams(
  functionName: string,
  abi: Interface,
): [string[], string[]] {
  const params = abi.fragments.find(
    ({ name }) => name === functionName,
  )?.inputs;
  if (typeof params === 'undefined') {
    throw new Error(`Function ${functionName} not present in ABI`);
  }
  const paramNames = params.map(({ name }) => name!);
  const paramTypes = params.map(({ type }) => type!);
  return [paramNames, paramTypes];
}

export async function resolveName(
  name: string,
  ensResolver: Address,
  signerOrProvider: ethers.Signer | providers.Provider,
): Promise<Address | null> {
  const namehash = utils.namehash(name);
  const resolver = await new Contract(
    ensResolver,
    ['function resolver(bytes32 node) external view returns (address)'],
    signerOrProvider,
  ).resolver(namehash);
  if (resolver === ethers.constants.AddressZero) return null;
  const daoAddress = await new Contract(
    resolver,
    ['function addr(bytes32 node) external view returns (address ret)'],
    signerOrProvider,
  ).addr(namehash);
  return daoAddress === ethers.constants.AddressZero ? null : daoAddress;
}

export function getAragonEnsResolver(chainId: number): string {
  switch (chainId) {
    case 4:
      return '0x98Df287B6C145399Aaa709692c8D308357bC085D';
    case 100:
      return '0xaafca6b0c89521752e559650206d7c925fd0e530';
    default:
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  }
}

export function addressesEqual(first: Address, second: Address): boolean {
  first = first && first.toLowerCase();
  second = second && second.toLowerCase();
  return first === second;
}
