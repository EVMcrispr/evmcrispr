import type { Address } from "viem";
import { getContractAddress } from "viem";

/**
 * Computes the counterfactual CREATE address for a contract
 * that will be deployed by `creator` at `txCount + offset`.
 */
export async function computeNextContractAddress(
  creator: Address,
  offset: number,
  getTransactionCount: (addr: Address) => Promise<number>,
): Promise<Address> {
  const txCount = await getTransactionCount(creator);
  const nonce = BigInt(txCount) + BigInt(offset);
  return getContractAddress({ from: creator, nonce });
}
