import type { Signer } from 'ethers';

import type { Address } from '../../../..';
import { resolveName } from '../../../../utils';

function getAragonEnsResolver(chainId: number): string {
  switch (chainId) {
    case 4:
      return '0x98Df287B6C145399Aaa709692c8D308357bC085D';
    case 100:
      return '0xaafca6b0c89521752e559650206d7c925fd0e530';
    default:
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  }
}

export async function aragonEns(
  ens: string,
  ensResolver: Address,
  signer: Signer,
): Promise<string> {
  const name = await resolveName(
    ens,
    ensResolver || getAragonEnsResolver(await signer.getChainId()),
    signer,
  );

  if (!name) {
    throw new Error(`ENS ${ens} can not be resolved.`);
  }

  return name;
}
