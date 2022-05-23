import type { EVMcrispr } from '..';

async function me(evm: EVMcrispr): Promise<string> {
  return evm.signer.getAddress();
}

export default me;
