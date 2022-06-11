import type { EVMcrispr } from '../../..';

function me(evm: EVMcrispr): Promise<string> {
  return evm.signer.getAddress();
}

export default me;
