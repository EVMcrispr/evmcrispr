import type { PublicClient } from "viem";
import { namehash, parseAbi, zeroAddress } from "viem";
import { normalize } from "viem/ens";

import { ErrorException } from "../errors";
import type { Address } from "../types";

/**
 * Normalizes an ENS name following ENSIP-1 (UTS-46).
 * Throws an ErrorException if the name is invalid.
 */
export function normalizeEnsName(name: string): string {
  try {
    return normalize(name);
  } catch (e) {
    throw new ErrorException(
      `Invalid ENS name "${name}": ${e instanceof Error ? e.message : "normalization failed"}`,
    );
  }
}

/**
 * Resolves an ENS name to an address.
 *
 * When a custom ENS registry is provided (e.g. Aragon's ENS on Gnosis/Optimism),
 * uses the classic registry → resolver → addr(node) flow.
 *
 * When no custom registry is provided, uses viem's built-in `getEnsAddress`
 * which supports the Universal Resolver, wildcard resolution (ENSIP-10),
 * and CCIP-Read (EIP-3668) on chains that have ENS configured.
 */
export async function resolveName(
  name: string,
  client: PublicClient,
  ensRegistry?: Address,
): Promise<Address | null> {
  const normalized = normalizeEnsName(name);

  if (ensRegistry) {
    return resolveFromRegistry(normalized, ensRegistry, client);
  }

  try {
    const address = await client.getEnsAddress({ name: normalized });
    return (address as Address) ?? null;
  } catch (e) {
    throw new ErrorException(
      `Failed to resolve ENS name "${name}": ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }
}

/**
 * Resolves an ENS name from a custom ENS registry using the classic
 * registry → resolver → addr(node) flow.
 */
async function resolveFromRegistry(
  normalizedName: string,
  ensRegistry: Address,
  client: PublicClient,
): Promise<Address | null> {
  const node = namehash(normalizedName);

  let resolver: Address;
  try {
    resolver = await client.readContract({
      address: ensRegistry,
      abi: parseAbi([
        "function resolver(bytes32 node) external view returns (address)",
      ]),
      functionName: "resolver",
      args: [node],
    });
  } catch (e) {
    throw new ErrorException(
      `Failed to query resolver from ENS registry ${ensRegistry} for "${normalizedName}": ${
        e instanceof Error ? e.message : "unknown error"
      }`,
    );
  }

  if (resolver === zeroAddress) return null;

  let address: Address;
  try {
    address = await client.readContract({
      address: resolver,
      abi: parseAbi([
        "function addr(bytes32 node) external view returns (address ret)",
      ]),
      functionName: "addr",
      args: [node],
    });
  } catch (e) {
    throw new ErrorException(
      `Resolver ${resolver} failed to resolve "${normalizedName}": ${
        e instanceof Error ? e.message : "unknown error"
      }`,
    );
  }

  return address === zeroAddress ? null : address;
}
