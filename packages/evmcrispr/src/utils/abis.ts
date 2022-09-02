import { ethers, utils } from 'ethers';

import { ErrorConnection, ErrorException } from '../errors';

export async function getAbiSignatures(
  etherscanAPI: string,
  address: string,
  chainId: number,
  name?: string,
): Promise<string[]> {
  if (!address) {
    return [];
  }
  let network: string;
  switch (chainId) {
    case 1:
      network = '';
      break;
    case 4:
      network = '-rinkeby';
      break;
    default:
      throw new Error('Network not supported in Etherscan.');
  }
  let abi = await fetch(
    `https://api${network}.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${etherscanAPI}`,
  )
    .then((response) => response.json())
    .then((data) => data.result);
  if (!abi.startsWith('[')) {
    abi = '[]';
  }
  const functions = JSON.parse(abi)
    .filter((fragment: ethers.utils.Fragment) => fragment.type === 'function')
    .filter(
      (fragment: ethers.utils.FunctionFragment) =>
        !name || fragment.name === name,
    )
    .map((fragment: ethers.utils.FunctionFragment) =>
      ethers.utils.FunctionFragment.from(fragment).format('minimal'),
    ) as string[];
  return functions;
}

export async function getAbiEntries(
  etherscanAPI: string,
  address: string,
  chainId: number,
): Promise<utils.Interface> {
  let network: string;
  switch (chainId) {
    case 1:
      network = '';
      break;
    case 4:
      network = '-rinkeby';
      break;
    default:
      throw new ErrorException('network not supported in Etherscan.');
  }
  const response = (await fetch(
    `https://api${network}.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${etherscanAPI}`,
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
