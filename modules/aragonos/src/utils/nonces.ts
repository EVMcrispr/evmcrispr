import type { Address, PublicClient } from "viem";

export async function buildNonceForAddress(
  address: Address,
  index: number,
  client: PublicClient,
): Promise<bigint> {
  const txCount = await client.getTransactionCount({ address });
  return BigInt(txCount) + BigInt(index);
}
