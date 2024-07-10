import type { PublicClient } from "viem";

import { ErrorException } from "../errors";
import type { Abi, Address } from "../types";
import { fetchImplementationAddress } from "./proxies";

async function getAbiEntries(address: string, chainId: number): Promise<Abi> {
  return await fetch(
    `https://abi.functions.on-fleek.app/v0/${chainId}/${address}`,
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

  const fetchedAbi = await getAbiEntries(targetAddress, chainId);

  return [targetAddress, fetchedAbi];
};
