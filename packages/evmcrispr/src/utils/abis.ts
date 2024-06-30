import type { PublicClient } from "viem";

import { ErrorConnection, ErrorException } from "../errors";
import type { Abi, Address } from "../types";
import { fetchImplementationAddress } from "./proxies";

async function getAbiEntries(
  etherscanAPI: string,
  address: string,
  chainId: number,
): Promise<Abi> {
  let baseUrl: string;
  // TODO: Do not rely on etherscan and use https://github.com/cdump/evmole
  switch (chainId) {
    case 1:
      baseUrl = "https://api.etherscan.io/api";
      break;
    case 5:
      baseUrl = "https://api-goerli.etherscan.io/api";
      break;
    case 10:
      baseUrl = "https://api-optimistic.etherscan.io/api";
      break;
    case 100:
      baseUrl = "https://blockscout.com/xdai/mainnet/api";
      break;
    default:
      throw new ErrorException("network not supported in Etherscan.");
  }

  const apiKeySegment = chainId !== 100 ? `&apikey=${etherscanAPI}` : "";

  const response = (await fetch(
    `${baseUrl}?module=contract&action=getabi&address=${address}${apiKeySegment}`,
  )
    .then((response) => response.json())
    .then((data) => data)) as {
    status: string;
    message: string;
    result: string;
  };

  if (response.status == "0") {
    throw new ErrorConnection(response.result);
  }

  return JSON.parse(response.result);
}

export const fetchAbi = async (
  contractAddress: Address,
  client: PublicClient,
  etherscanAPI: string,
): Promise<[Address, Abi]> => {
  const implementationAddress = await fetchImplementationAddress(
    contractAddress,
    client,
  );
  const targetAddress = implementationAddress ?? contractAddress;
  const chainId = await client?.getChainId();

  if (!chainId) {
    throw new ErrorException("Chain id is not supported");
  }

  const fetchedAbi = await getAbiEntries(etherscanAPI, targetAddress, chainId);

  return [targetAddress, fetchedAbi];
};
