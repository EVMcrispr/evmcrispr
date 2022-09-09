import type { providers } from 'ethers';
import { Contract, ethers, utils } from 'ethers';

import { ErrorException } from '../../../errors';

import type { Address } from '../../../types';

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

export async function resolveName(
  name: string,
  ensResolver: Address,
  signerOrProvider: ethers.Signer | providers.Provider,
): Promise<Address | null> {
  if (!/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth/.test(name)) {
    throw new ErrorException(`ENS not valid: ${name}`);
  }
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
