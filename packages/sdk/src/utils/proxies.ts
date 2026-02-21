import type { Address, PublicClient } from "viem";
import {
  getAddress,
  isAddressEqual,
  keccak256,
  parseAbi,
  toHex,
  trim,
  zeroAddress,
} from "viem";

/**
 * Standardized storage slot determined by bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
 * and defined on EIP-1967 (https://eips.ethereum.org/EIPS/eip-1967#logic-contract-address)
 */
const EIP1967_STORAGE_SLOT = toHex(
  BigInt(keccak256(toHex("eip1967.proxy.implementation"))) - 1n,
);

const EIP1967_BEACON_STORAGE_SLOT = toHex(
  BigInt(keccak256(toHex("eip1967.proxy.beacon"))) - 1n,
);

const EIP1822_PROXIABLE = keccak256(toHex("PROXIABLE"));

/**
 * Pre-EIP-1967 slot used by OpenZeppelin Upgrades v2 / ZeppelinOS proxies
 * (e.g. Circle's FiatTokenProxy for USDC).  Unlike EIP-1967 this is the raw
 * keccak256 hash without the -1 offset.
 */
const ZEPPELINOS_IMPLEMENTATION_SLOT = keccak256(
  toHex("org.zeppelinos.proxy.implementation"),
);

const EIP1167_PREFIX = "0x363d3d373d3d3d363d73";
const EIP1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

const PROXY_ABI = parseAbi([
  "function implementation() public view returns (address)",
  "function childImplementation() external view returns (address)",
  "function masterCopy() external view returns (address)",
]);

const isNonZeroAddress = (addr: Address): boolean => {
  try {
    return !isAddressEqual(addr, zeroAddress);
  } catch {
    return false;
  }
};

const addressFromSlot = (
  raw: `0x${string}` | undefined,
): Address | undefined => {
  if (!raw) return undefined;
  const trimmed = trim(raw);
  return isNonZeroAddress(trimmed) ? trimmed : undefined;
};

async function resolveBeaconImplementation(
  beaconAddress: Address,
  client: PublicClient,
  visited: Set<string>,
): Promise<Address | undefined> {
  const results = await client.multicall({
    contracts: [
      {
        address: beaconAddress,
        abi: PROXY_ABI,
        functionName: "implementation",
      },
      {
        address: beaconAddress,
        abi: PROXY_ABI,
        functionName: "childImplementation",
      },
    ],
    allowFailure: true,
  });

  for (const result of results) {
    if (
      result.status === "success" &&
      result.result &&
      isNonZeroAddress(result.result)
    ) {
      return (
        (await resolveImpl(result.result, client, visited)) || result.result
      );
    }
  }

  return undefined;
}

async function resolveImpl(
  address: Address,
  client: PublicClient,
  visited: Set<string>,
): Promise<Address | undefined> {
  return fetchImplementationAddress(address, client, visited);
}

export async function fetchImplementationAddress(
  address: Address,
  client: PublicClient,
  _visited?: Set<string>,
): Promise<Address | undefined> {
  const visited = _visited ?? new Set<string>();
  const key = address.toLowerCase();
  if (visited.has(key)) return undefined;
  visited.add(key);

  const [code, eip1967Raw, eip1822Raw, zeosRaw, beaconRaw, fnResults] =
    await Promise.all([
      client.getCode({ address }),
      client.getStorageAt({ address, slot: EIP1967_STORAGE_SLOT }),
      client.getStorageAt({ address, slot: EIP1822_PROXIABLE }),
      client.getStorageAt({ address, slot: ZEPPELINOS_IMPLEMENTATION_SLOT }),
      client.getStorageAt({ address, slot: EIP1967_BEACON_STORAGE_SLOT }),
      client.multicall({
        contracts: [
          { address, abi: PROXY_ABI, functionName: "implementation" },
          { address, abi: PROXY_ABI, functionName: "masterCopy" },
        ],
        allowFailure: true,
      }),
    ]);

  // EIP-1167 minimal proxy (clone) — bytecode pattern
  if (
    code?.startsWith(EIP1167_PREFIX) &&
    code.endsWith(EIP1167_SUFFIX) &&
    code.length === EIP1167_PREFIX.length + 40 + EIP1167_SUFFIX.length
  ) {
    const impl = getAddress(
      `0x${code.slice(EIP1167_PREFIX.length, EIP1167_PREFIX.length + 40)}`,
    );
    return (await resolveImpl(impl, client, visited)) || impl;
  }

  // EIP-1967 transparent/UUPS proxy
  const eip1967Impl = addressFromSlot(eip1967Raw);
  if (eip1967Impl) {
    return (await resolveImpl(eip1967Impl, client, visited)) || eip1967Impl;
  }

  // EIP-1822 (UUPS alternate slot)
  const eip1822Impl = addressFromSlot(eip1822Raw);
  if (eip1822Impl) {
    return (await resolveImpl(eip1822Impl, client, visited)) || eip1822Impl;
  }

  // ZeppelinOS / OpenZeppelin Upgrades v2 (pre-EIP-1967)
  const zeosImpl = addressFromSlot(zeosRaw);
  if (zeosImpl) {
    return (await resolveImpl(zeosImpl, client, visited)) || zeosImpl;
  }

  // Direct implementation() / masterCopy() via multicall3
  for (const result of fnResults) {
    if (
      result.status === "success" &&
      result.result &&
      isNonZeroAddress(result.result)
    ) {
      return (
        (await resolveImpl(result.result, client, visited)) || result.result
      );
    }
  }

  // EIP-1967 beacon proxy
  const beaconAddr = addressFromSlot(beaconRaw);
  if (beaconAddr) {
    return resolveBeaconImplementation(beaconAddr, client, visited);
  }

  return undefined;
}
