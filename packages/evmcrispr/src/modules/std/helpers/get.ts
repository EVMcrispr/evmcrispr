import { Contract } from 'ethers';

import type { EVMcrispr } from '../../..';

async function get(
  evm: EVMcrispr,
  addr: string,
  abi: string,
  ...params: string[]
): Promise<string> {
  const [entity] = await evm.resolver.resolvePromises([addr], ['address']);
  const [body, returns] = abi.split(':');
  const contract = new Contract(
    entity,
    [`function ${body} external view returns ${returns}`],
    evm.signer,
  );
  return contract[body](...params);
}

export default get;
