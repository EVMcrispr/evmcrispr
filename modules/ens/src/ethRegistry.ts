import type { Address, PublicClient } from "viem";
import { labelhash, parseAbi } from "viem";
import { ethRegistryMap } from "./addresses";

/**
 * ENSv2 ETHRegistry (ensdomains/contracts-v2, `PermissionedRegistry`): an
 * ERC-1155 of .eth names. Any id of a name (its labelhash included) reads its
 * state; the token id is the current version, regenerated when roles change.
 */
export const ethRegistryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
]);

/** `IPermissionedRegistry.Status`. */
export const V2_STATUS = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 } as const;

export interface V2Name {
  registry: Address;
  owner: Address;
  tokenId: bigint;
}

/** The ENSv2 registration of a .eth label, or undefined when the label is not
 *  registered on ENSv2 (still on ENS v1, free, or a chain without ENSv2). */
export async function v2Registration(
  client: PublicClient,
  chainId: number,
  label: string,
): Promise<V2Name | undefined> {
  const registry = ethRegistryMap.get(chainId);
  if (!registry) return undefined;
  const state = await client.readContract({
    address: registry,
    abi: ethRegistryAbi,
    functionName: "getState",
    args: [BigInt(labelhash(label))],
  });
  if (state.status !== V2_STATUS.REGISTERED) return undefined;
  return { registry, owner: state.latestOwner, tokenId: state.tokenId };
}
