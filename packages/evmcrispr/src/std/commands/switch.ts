import { providers } from 'ethers';

import { ErrorException } from '../../errors';
import type { ICommand, ProviderAction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
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

export const _switch: ICommand<Std> = {
  async run(module, c, { interpretNodes }): Promise<ProviderAction[]> {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });

    const provider = await module.getProvider();

    if (!(provider instanceof providers.JsonRpcProvider)) {
      throw new ErrorException('JSON-RPC based providers supported only');
    }

    const [networkNameOrId] = await interpretNodes(c.args);

    let chainId: number;
    chainId = Number(networkNameOrId.toString());

    if (!Number.isInteger(chainId)) {
      if (typeof networkNameOrId !== 'string') {
        throw new ErrorException(
          `Invalid chain id. Expected a string or number, but got ${typeof networkNameOrId}`,
        );
      }
      chainId =
        nameToChainId[
          networkNameOrId?.toLowerCase() as keyof typeof nameToChainId
        ];
      if (!chainId) {
        throw new ErrorException(`chain "${networkNameOrId}" not found`);
      }
    }

    await module.switchChainId(chainId);

    return [
      {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      },
    ];
  },
  buildCompletionItemsForArg(argIndex) {
    switch (argIndex) {
      case 0:
        return [
          ...Object.keys(nameToChainId),
          ...Object.values(nameToChainId).map((chainId) => chainId.toString()),
        ];
      default:
        return [];
    }
  },
  async runEagerExecution() {
    return;
  },
};
