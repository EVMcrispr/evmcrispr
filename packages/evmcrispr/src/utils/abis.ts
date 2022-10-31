import type { providers } from 'ethers';
import { utils } from 'ethers';

import { ErrorConnection, ErrorException } from '../errors';
import type { Address } from '../types';
import { fetchImplementationAddress } from './proxies';

async function getAbiEntries(
  etherscanAPI: string,
  address: string,
  chainId: number,
): Promise<utils.Interface> {
  let baseUrl: string;
  switch (chainId) {
    case 1:
      baseUrl = 'https://api.etherscan.io/api';
      break;
    case 4:
      baseUrl = 'https://api-rinkeby.etherscan.io/api';
      break;
    case 100:
      baseUrl = 'https://blockscout.com/xdai/mainnet/api';
      break;
    default:
      throw new ErrorException('network not supported in Etherscan.');
  }

  const apiKeySegment = chainId !== 100 ? `&apikey=${etherscanAPI}` : '';

  const response = (await fetch(
    `${baseUrl}?module=contract&action=getabi&address=${address}${apiKeySegment}`,
  )
    .then((response) => response.json())
    .then((data) => data)) as {
    status: string;
    message: string;
    result: string;
  };

  if (response.status == '0') {
    throw new ErrorConnection(response.result);
  }

  return new utils.Interface(response.result);
}

export const fetchAbi = async (
  contractAddress: Address,
  provider: providers.Provider,
  etherscanAPI: string,
): Promise<[Address, utils.Interface]> => {
  const implementationAddress = await fetchImplementationAddress(
    contractAddress,
    provider,
  );
  const targetAddress = implementationAddress ?? contractAddress;

  const fetchedAbi = await getAbiEntries(
    etherscanAPI,
    targetAddress,
    (
      await provider.getNetwork()
    ).chainId,
  );

  return [targetAddress, fetchedAbi];
};
