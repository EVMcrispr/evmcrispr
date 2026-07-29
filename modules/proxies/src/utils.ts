import type { Address, Hex, PublicClient } from "viem";
import { getAddress, parseAbi } from "viem";

// ERC-1967 storage slots (keccak256("eip1967.proxy.<field>") - 1)
export const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;

export const beaconAbi = parseAbi([
  "function implementation() view returns (address)",
]);

/** Address stored in a proxy storage slot, or undefined when the slot is empty. */
export async function readSlotAddress(
  client: PublicClient,
  address: Address,
  slot: Hex,
): Promise<Address | undefined> {
  const word = await client.getStorageAt({ address, slot });
  if (!word || BigInt(word) === 0n) return undefined;
  return getAddress(`0x${word.slice(-40)}`);
}

/** Arachnid deterministic CREATE2 deployer (same default as contracts:deploy). */
export const ARACHNID_CREATE2: Address =
  "0x4e59b44847b379578588920ca78fbf26c0b4956c";

/** ERC-1167 minimal proxy creation bytecode for an implementation. */
export function cloneInitCode(implementation: Address): Hex {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementation
    .slice(2)
    .toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
