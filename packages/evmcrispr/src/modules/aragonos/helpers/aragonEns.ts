import type { EVMcrispr } from '../../..';
import { getAragonEnsResolver, resolveName } from '../../../utils';

async function aragonEns(
  evm: EVMcrispr,
  ens: string,
  ensResolver?: string,
): Promise<string> {
  const name = await resolveName(
    ens,
    ensResolver ?? getAragonEnsResolver(await evm.signer.getChainId()),
    evm.signer,
  );

  if (!name) {
    throw new Error(`ENS ${ens} can not be resolved.`);
  }

  return name;
}

export default aragonEns;
