import type { Address, PublicClient } from "viem";
import { getContractAddress } from "viem";

export async function buildNonceForAddress(
  address: Address,
  index: number,
  client: PublicClient,
): Promise<bigint> {
  const txCount = await client.getTransactionCount({ address });
  return BigInt(txCount) + BigInt(index);
}

/**
 * Calculates the next created address by the kernel
 * @dev see https://ethereum.stackexchange.com/questions/760/how-is-the-address-of-an-ethereum-contract-computed/761#761
 * @param {*} daoAddress address of the kernel
 * @param {*} nonce address nonce
 * @returns {string} conterfactual address
 */
export function calculateNewProxyAddress(
  daoAddress: Address,
  nonce: number,
): Address {
  return getContractAddress({ from: daoAddress, nonce: BigInt(nonce) });
}
