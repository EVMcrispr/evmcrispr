import { ErrorException } from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import { labelhash, parseAbi, zeroAddress } from "viem";
import { ethRegistryMap } from "./addresses";
import { eth2LDLabel, isEth2LD } from "./utils";

/**
 * ENSv2 ETHRegistry (`PermissionedRegistry`, verified on Sourcify): an
 * ERC-1155 of .eth names. Any id of a name (its labelhash included) reads its
 * state; the token id is the current version, regenerated when roles change.
 */
export const ethRegistryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
  "function getResolver(string label) view returns (address)",
]);

/** `IPermissionedRegistry.Status`. */
export const V2_STATUS = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 } as const;

export interface V2Name {
  registry: Address;
  label: string;
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
  return {
    registry,
    label,
    owner: state.latestOwner,
    tokenId: state.tokenId,
  };
}

/** The ENSv2 registration of `name` when it is an ENSv2 .eth name, undefined
 *  when it is on ENS v1. Subnames of an ENSv2 name live in its subregistry,
 *  which this module does not manage yet: they stop with an error rather than
 *  falling through to ENS v1, where they do not exist. */
export async function v2Name(
  client: PublicClient,
  chainId: number,
  name: string,
): Promise<V2Name | undefined> {
  const labels = name.toLowerCase().split(".");
  if (labels.length < 2 || labels[labels.length - 1] !== "eth")
    return undefined;
  const parentLabel = labels[labels.length - 2];
  const v2 = await v2Registration(client, chainId, parentLabel);
  if (!v2) return undefined;
  if (!isEth2LD(name)) {
    throw new ErrorException(
      `${name} is a subname of the ENSv2 name ${parentLabel}.eth, and subnames of ENSv2 names are not supported yet`,
    );
  }
  return { ...v2, label: eth2LDLabel(name) };
}

/** The resolver an ENSv2 name has in the ETHRegistry. */
export async function v2Resolver(
  client: PublicClient,
  name: string,
  v2: V2Name,
): Promise<Address> {
  const resolver = await client.readContract({
    address: v2.registry,
    abi: ethRegistryAbi,
    functionName: "getResolver",
    args: [v2.label],
  });
  if (resolver === zeroAddress) {
    throw new ErrorException(
      `${name} has no resolver set: create one with ens:create-resolver and set it with ens:set-resolver`,
    );
  }
  return resolver;
}
