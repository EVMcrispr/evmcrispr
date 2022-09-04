import { providers } from 'ethers';

import { EVMcrispr } from '../../../EVMcrispr';

import type { CommandFunction, ProviderAction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';

const nameToChainId = {
  mainnet: 1,
  ropsten: 3,
  rinkeby: 4,
  goerli: 5,
  kovan: 42,
  optimism: 10,
  optimismKovan: 69,
  gnosis: 100,
  polygon: 137,
  polygonMumbai: 80001,
  arbitrum: 42161,
  arbitrumRinkeby: 421611,
};

export const _switch: CommandFunction<Std> = async (
  module,
  c,
  { interpretNodes },
): Promise<ProviderAction[]> => {
  checkArgsLength(c, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const provider = module.signer.provider;
  if (!(provider instanceof providers.JsonRpcProvider)) {
    EVMcrispr.panic(c, 'JSON-RPC based providers supported only');
  }

  const [networkNameOrId] = await interpretNodes(c.args);

  let chainId: number;
  chainId = Number(networkNameOrId.toString());

  if (!Number.isInteger(chainId)) {
    if (typeof chainId !== 'string') {
      EVMcrispr.panic(
        c,
        `Invalid chain id. Expected a string or number, but got ${typeof networkNameOrId}`,
      );
    }
    chainId =
      nameToChainId[
        networkNameOrId?.toLowerCase() as keyof typeof nameToChainId
      ];
    if (!chainId) {
      EVMcrispr.panic(c, `chain "${networkNameOrId}" not found`);
    }
  }

  return [
    {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    },
  ];
};
