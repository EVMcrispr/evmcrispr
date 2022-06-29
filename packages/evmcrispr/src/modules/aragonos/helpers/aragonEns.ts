import type { EVMcrispr } from '../../..';
import { getAragonEnsResolver, resolveName } from '../../../utils';

async function aragonEns(evm: EVMcrispr, ens: string): Promise<string> {
  const name = await resolveName(
    ens,
    (evm.env('$aragonos.ensResolver') as string) ||
      getAragonEnsResolver(await evm.signer.getChainId()),
    evm.signer,
  );

  if (!name) {
    throw new Error(`ENS ${ens} can not be resolved.`);
  }

  return name;
}

export default aragonEns;
