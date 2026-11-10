import { ErrorException } from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import { labelhash, parseAbi, zeroAddress } from "viem";
import { ethRegistryMap } from "./addresses";

/**
 * ENSv2 registries (`PermissionedRegistry`: the ETHRegistry of .eth names and
 * each name's UserRegistry of subnames; verified on Sourcify): ERC-1155s of
 * names. Any id of a name (its labelhash included) reads its state; the token
 * id is the current version, regenerated when roles change.
 */
export const registryAbi = parseAbi([
  "struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }",
  "function getState(uint256 anyId) view returns (State state)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function isEmancipated() view returns (bool)",
]);

/** `IPermissionedRegistry.Status`. */
export const V2_STATUS = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 } as const;

/** A UserRegistry is initialized with the root roles it grants. */
export const userRegistryAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants)",
]);

// RegistryRolesLib (deployed): each admin role sits 128 bits above its role.
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;
const ROLE_CAN_TRANSFER = 1n << 28n;
const admin = (role: bigint) => role << 128n;

/** The roles the ETHRegistrar gives the owner of a .eth name, which a subname
 *  gets too: set its subregistry and resolver (and grant both), and transfer
 *  it. Equals 0x1110000000000000000000000000000001100000. */
export const OWNER_ROLES =
  ROLE_SET_SUBREGISTRY |
  ROLE_SET_RESOLVER |
  admin(ROLE_SET_SUBREGISTRY) |
  admin(ROLE_SET_RESOLVER) |
  admin(ROLE_CAN_TRANSFER);

/** A name registered on ENSv2, found in the registry that holds it. */
export interface V2Name {
  /** The registry holding the name: the ETHRegistry for a .eth name, the
   *  parent's subregistry for a subname. */
  registry: Address;
  label: string;
  owner: Address;
  tokenId: bigint;
  expiry: bigint;
  /** The deepest resolver set on the way down (ENSIP-10: a name without
   *  one uses its closest ancestor's), or the zero address. */
  resolver: Address;
}

async function state(client: PublicClient, registry: Address, label: string) {
  return client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getState",
    args: [BigInt(labelhash(label))],
  });
}

async function read(
  client: PublicClient,
  registry: Address,
  functionName: "getResolver" | "getSubregistry",
  label: string,
): Promise<Address> {
  return client.readContract({
    address: registry,
    abi: registryAbi,
    functionName,
    args: [label],
  });
}

/** The ENSv2 registration of a .eth name or of a subname under an ENSv2
 *  name, or undefined when the name's .eth ancestor is not on ENSv2 (still on
 *  ENS v1, free, or a chain without ENSv2). Under an ENSv2 name, a name that
 *  is not there stops with an error rather than falling through to ENS v1,
 *  where it cannot be. */
export async function v2Name(
  client: PublicClient,
  chainId: number,
  name: string,
): Promise<V2Name | undefined> {
  const labels = name.toLowerCase().split(".");
  if (labels.length < 2 || labels[labels.length - 1] !== "eth")
    return undefined;
  const ethRegistry = ethRegistryMap.get(chainId);
  if (!ethRegistry) return undefined;

  // From the .eth name down: each label is registered in the registry its
  // parent points to.
  const path = labels.slice(0, -1).reverse();
  let registry = ethRegistry;
  let resolver: Address = zeroAddress;
  let found: V2Name | undefined;
  for (const [i, label] of path.entries()) {
    const s = await state(client, registry, label);
    if (s.status !== V2_STATUS.REGISTERED) {
      if (i === 0) return undefined;
      throw new ErrorException(
        `${path
          .slice(0, i + 1)
          .reverse()
          .join(".")}.eth is not registered under the ENSv2 name ${path
          .slice(0, i)
          .reverse()
          .join(".")}.eth`,
      );
    }
    const own = await read(client, registry, "getResolver", label);
    if (own !== zeroAddress) resolver = own;
    found = {
      registry,
      label,
      owner: s.latestOwner,
      tokenId: s.tokenId,
      expiry: s.expiry,
      resolver,
    };
    if (i === path.length - 1) break;
    const sub = await read(client, registry, "getSubregistry", label);
    if (sub === zeroAddress) {
      throw new ErrorException(
        `${path
          .slice(0, i + 1)
          .reverse()
          .join(
            ".",
          )}.eth has no subnames: it is an ENSv2 name without a subregistry`,
      );
    }
    registry = sub;
  }
  return found;
}

/** The resolver an ENSv2 name uses (its own, or its closest ancestor's). */
export function v2Resolver(name: string, v2: V2Name): Address {
  if (v2.resolver === zeroAddress) {
    throw new ErrorException(
      `${name} has no resolver set: create one with ens:create-resolver and set it with ens:set-resolver`,
    );
  }
  return v2.resolver;
}

/** The subregistry of an ENSv2 name, or the zero address. */
export async function v2Subregistry(
  client: PublicClient,
  v2: V2Name,
): Promise<Address> {
  return read(client, v2.registry, "getSubregistry", v2.label);
}

/** Whether a registry lets its tokens move with `safeTransferFrom`; one that
 *  is not emancipated only takes `unsafeTransfer`. */
export async function isEmancipated(
  client: PublicClient,
  registry: Address,
): Promise<boolean> {
  return client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "isEmancipated",
  });
}

/** NameWrapper commands do not apply to ENSv2 names: what fuses did there,
 *  roles do on ENSv2. */
export async function refuseV2(
  client: PublicClient,
  chainId: number,
  name: string,
  command: string,
): Promise<void> {
  if (await v2Name(client, chainId, name)) {
    throw new ErrorException(
      `${name} is an ENSv2 name: ${command} is for names wrapped on ENS v1, and ENSv2 names have roles instead of fuses`,
    );
  }
}
