import type { Address } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getAddress, isAddressEqual, parseAbi, sliceHex } from "viem";
import { GUARD_STORAGE_SLOT, SENTINEL } from "../addresses";

export const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function isOwner(address owner) view returns (bool)",
  "function nonce() view returns (uint256)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function getStorageAt(uint256 offset, uint256 length) view returns (bytes)",
  "function VERSION() view returns (string)",
]);

export const getOwners = async (
  client: PublicClient,
  safe: Address,
): Promise<Address[]> => {
  try {
    return [
      ...(await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "getOwners",
      })),
    ];
  } catch {
    throw new ErrorException(`${safe} does not look like a Safe contract`);
  }
};

export const getThreshold = async (
  client: PublicClient,
  safe: Address,
): Promise<bigint> =>
  client.readContract({
    address: safe,
    abi: safeAbi,
    functionName: "getThreshold",
  });

export const getSafeNonce = async (
  client: PublicClient,
  safe: Address,
): Promise<bigint> =>
  client.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });

export const getModules = async (
  client: PublicClient,
  safe: Address,
): Promise<Address[]> => {
  const modules: Address[] = [];
  let start: Address = SENTINEL;
  for (;;) {
    const [page, next] = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getModulesPaginated",
      args: [start, 100n],
    });
    modules.push(...page);
    if (next === SENTINEL || page.length === 0) break;
    start = next;
  }
  return modules;
};

export const getGuard = async (
  client: PublicClient,
  safe: Address,
): Promise<Address> => {
  const value = await client.getStorageAt({
    address: safe,
    slot: GUARD_STORAGE_SLOT,
  });
  return getAddress(sliceHex(value ?? `0x${"0".repeat(64)}`, 12));
};

/** Predecessor of `entry` in a Safe sentinel linked list (owners or
 *  modules), as required by removeOwner/swapOwner/disableModule. */
export const findListPredecessor = (
  list: Address[],
  entry: Address,
  label: string,
): Address => {
  const index = list.findIndex((item) => isAddressEqual(item, entry));
  if (index === -1) {
    throw new ErrorNotFound(`${label} ${entry} not found on the Safe`);
  }
  return index === 0 ? SENTINEL : list[index - 1];
};
