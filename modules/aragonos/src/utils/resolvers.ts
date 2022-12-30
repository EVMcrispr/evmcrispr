import { ErrorException } from '@1hive/evmcrispr';
import type { Address } from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { Contract, ethers, utils } from 'ethers';

export function getAragonEnsResolver(chainId: number): string | never {
  switch (chainId) {
    case 1:
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
    case 4:
      return '0x98Df287B6C145399Aaa709692c8D308357bC085D';
    case 5:
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
    case 100:
      return '0xaafca6b0c89521752e559650206d7c925fd0e530';
    default:
      throw new ErrorException(
        `No Aragon ENS resolver found for chain id ${chainId}`,
      );
  }
}

export async function resolveName(
  name: string,
  ensResolver: Address,
  provider: providers.Provider,
): Promise<Address | null> {
  if (!/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth/.test(name)) {
    throw new ErrorException(`ENS not valid: ${name}`);
  }
  const namehash = utils.namehash(name);
  const resolver = await new Contract(
    ensResolver,
    ['function resolver(bytes32 node) external view returns (address)'],
    provider,
  ).resolver(namehash);
  if (resolver === ethers.constants.AddressZero) return null;
  const daoAddress = await new Contract(
    resolver,
    ['function addr(bytes32 node) external view returns (address ret)'],
    provider,
  ).addr(namehash);
  return daoAddress === ethers.constants.AddressZero ? null : daoAddress;
}
