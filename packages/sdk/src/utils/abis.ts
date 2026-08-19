import type { PublicClient } from "viem";
import { getAddress } from "viem";

import { ErrorException } from "../errors";
import type { Abi, Address } from "../types";
import { fetchImplementationAddress } from "./proxies";

/** Build the binding key for an ABI entry: `<chainId>:<address>`. */
export const abiBindingKey = (chainId: number, address: Address): string =>
  `${chainId}:${getAddress(address)}`;

async function getAbiEntries(address: Address, chainId: number): Promise<Abi> {
  const res = await fetch(
    `https://api.evmcrispr.com/abi/${chainId}/${getAddress(address)}`,
  );
  if (!res.ok) {
    throw new ErrorException(`Failed to fetch ABI (HTTP ${res.status})`);
  }
  return res.json();
}

function mergeAbis(primary: Abi, secondary: Abi): Abi {
  const seen = new Set(primary.map((entry) => JSON.stringify(entry)));
  return [
    ...primary,
    ...secondary.filter((entry) => !seen.has(JSON.stringify(entry))),
  ];
}

export const fetchAbi = async (
  contractAddress: Address,
  client: PublicClient,
): Promise<[Address, Abi, number]> => {
  const chainId = await client?.getChainId();
  if (!chainId) {
    throw new ErrorException("Chain id is not supported");
  }

  const implementationAddress = await fetchImplementationAddress(
    contractAddress,
    client,
  );

  if (!implementationAddress) {
    return [
      contractAddress,
      await getAbiEntries(contractAddress, chainId),
      chainId,
    ];
  }

  const [proxyAbi, implAbi] = await Promise.allSettled([
    getAbiEntries(contractAddress, chainId),
    getAbiEntries(implementationAddress, chainId),
  ]);

  // One unverified (or momentarily unreachable) side is fine — an ABI made of
  // whichever half answered is still useful. Both failing is a lookup failure,
  // not an empty contract: surfacing it beats handing back an ABI with no
  // entries, which reads downstream as "this function does not exist".
  if (proxyAbi.status === "rejected" && implAbi.status === "rejected") {
    throw implAbi.reason;
  }

  return [
    implementationAddress,
    mergeAbis(
      implAbi.status === "fulfilled" ? implAbi.value : [],
      proxyAbi.status === "fulfilled" ? proxyAbi.value : [],
    ),
    chainId,
  ];
};
