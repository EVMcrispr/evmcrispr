import { encode } from "@ensdomains/content-hash";
import { ErrorException, normalizeEnsName } from "@evmcrispr/sdk";
import type { Address, Hex, PublicClient } from "viem";
import {
  createPublicClient,
  isHex,
  namehash,
  parseAbi,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { nameWrapperMap, registryMap, requireAddress } from "./addresses";

export const registryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
]);

export const nameWrapperAbi = parseAbi([
  "function ownerOf(uint256 id) view returns (address)",
  "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
]);

export function assertSupportedChain(chainId: number): void {
  requireAddress(registryMap, chainId, "ENS");
}

/** Namehash of the ENSIP-15 normalized name. */
export function getNode(name: string): Hex {
  return namehash(normalizeEnsName(name));
}

export async function getRegistryOwner(
  client: PublicClient,
  chainId: number,
  node: Hex,
): Promise<Address> {
  return client.readContract({
    address: requireAddress(registryMap, chainId, "registry"),
    abi: registryAbi,
    functionName: "owner",
    args: [node],
  });
}

export async function getRegistryResolver(
  client: PublicClient,
  chainId: number,
  node: Hex,
  name: string,
): Promise<Address> {
  const resolver = await client.readContract({
    address: requireAddress(registryMap, chainId, "registry"),
    abi: registryAbi,
    functionName: "resolver",
    args: [node],
  });
  if (resolver === zeroAddress) {
    throw new ErrorException(`${name} has no resolver set`);
  }
  return resolver;
}

export async function isWrapped(
  client: PublicClient,
  chainId: number,
  node: Hex,
): Promise<boolean> {
  const wrapper = nameWrapperMap.get(chainId);
  if (!wrapper) return false;
  const owner = await getRegistryOwner(client, chainId, node);
  return owner.toLowerCase() === wrapper.toLowerCase();
}

/** Owner, fuses and expiry of a wrapped name (zeroed when not wrapped). */
export async function getWrappedData(
  client: PublicClient,
  chainId: number,
  node: Hex,
): Promise<{ owner: Address; fuses: number; expiry: bigint }> {
  const [owner, fuses, expiry] = await client.readContract({
    address: requireAddress(nameWrapperMap, chainId, "NameWrapper"),
    abi: nameWrapperAbi,
    functionName: "getData",
    args: [BigInt(node)],
  });
  return { owner, fuses, expiry };
}

export function isEth2LD(name: string): boolean {
  const labels = normalizeEnsName(name).split(".");
  return labels.length === 2 && labels[1] === "eth";
}

/** The label of a `.eth` second-level name (`vitalik` for `vitalik.eth`). */
export function eth2LDLabel(name: string): string {
  const normalized = normalizeEnsName(name);
  if (!isEth2LD(normalized)) {
    throw new ErrorException(
      `${name} is not a second-level .eth name (e.g. vitalik.eth)`,
    );
  }
  return normalized.split(".")[0];
}

const CONTENTHASH_CODECS = ["ipfs", "ipns", "skynet"] as const;

/**
 * Encode a content hash for ENS records. Accepts `<codec>:<hash>` and
 * `<codec>://<hash>` forms (ipfs, ipns, skynet) plus already-encoded `0x`
 * bytes, which pass through untouched.
 */
export function encodeContenthash(input: string): Hex {
  if (isHex(input)) return input;
  const match = input.match(/^([a-z0-9]+):(?:\/\/)?(.+)$/);
  const [codec, hash] = match ? [match[1], match[2]] : [undefined, undefined];
  if (!codec || !CONTENTHASH_CODECS.includes(codec as any)) {
    throw new ErrorException(
      "Only ipfs, ipns and skynet are supported. The hash format should be <codec>:<hash>",
    );
  }
  if (!hash) {
    throw new ErrorException("The hash format should be <codec>:<hash>");
  }
  return `0x${encode(codec as "ipfs" | "ipns" | "skynet", hash)}`;
}

/** Mainnet-pinned client for ENS reads regardless of the connected chain. */
export function mainnetClient(module: {
  getTransport(chainId: number): any;
}): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: module.getTransport(mainnet.id),
  });
}
