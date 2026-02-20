import type { PublicClient } from "viem";
import { getAddress } from "viem";

import { ErrorException } from "../errors";
import type { Abi, Address } from "../types";
import { fetchImplementationAddress } from "./proxies";

/** Build the binding key for an ABI entry: `<chainId>:<address>`. */
export const abiBindingKey = (chainId: number, address: Address): string =>
  `${chainId}:${getAddress(address)}`;

async function getAbiEntries(address: Address, chainId: number): Promise<Abi> {
  return await fetch(
    `https://api.evmcrispr.com/abi/${chainId}/${getAddress(address)}`,
  )
    .then((res) => res.json())
    .catch((err) => {
      console.error(err);
      throw new ErrorException("Failed to fetch ABI");
    });
}

export const fetchAbi = async (
  contractAddress: Address,
  client: PublicClient,
): Promise<[Address, Abi, number]> => {
  const implementationAddress = await fetchImplementationAddress(
    contractAddress,
    client,
  );
  const targetAddress = implementationAddress ?? contractAddress;
  const chainId = await client?.getChainId();

  if (!chainId) {
    throw new ErrorException("Chain id is not supported");
  }

  const fetchedAbi = await getAbiEntries(targetAddress, chainId);

  return [targetAddress, fetchedAbi, chainId];
};
