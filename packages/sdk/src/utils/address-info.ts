import type { Chain, PublicClient } from "viem";
import { getAddress } from "viem";
import * as viemChains from "viem/chains";

import type { Address } from "../types";
import {
  fetchVerifiedContract,
  type VerifiedContractInfo,
} from "./contract-verification";
import { fetchImplementationAddress } from "./proxies";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddressChainData {
  /** Raw account code (undefined when the getCode call failed). */
  raw?: `0x${string}`;
  balance?: bigint;
  txCount?: number;
  ensName?: string | null;
}

export interface AddressContractExtras {
  implementation?: Address;
  /**
   * Verification metadata for the address itself. Only consulted when
   * the contract is *not* a proxy — proxy targets render the
   * implementation's verified data instead, since the proxy shell
   * (e.g. `TransparentUpgradeableProxy`) carries no information the user
   * cares about.
   */
  verified?: VerifiedContractInfo | null;
  implementationVerified?: VerifiedContractInfo | null;
}

/**
 * Everything `classifyAddress` learns about an address: what kind of
 * account it is plus best-effort on-chain and verification metadata.
 * Shared by the editor's address hover card and the contracts module's
 * `@contracts:account` helper.
 */
export interface AddressInfo extends AddressChainData, AddressContractExtras {
  address: Address;
  kind: "eoa" | "delegated-eoa" | "contract";
  codeSize: number;
  /** EIP-7702 delegation target, when `kind` is `delegated-eoa`. */
  delegate?: Address;
  delegateVerified?: VerifiedContractInfo | null;
}

// ---------------------------------------------------------------------------
// Chain / code helpers
// ---------------------------------------------------------------------------

/** Look up the viem `Chain` object for a chain id, if viem ships it. */
export function viemChainById(chainId: number | undefined): Chain | undefined {
  if (!chainId) return undefined;
  return Object.values(viemChains).find((c) => (c as Chain).id === chainId) as
    | Chain
    | undefined;
}

export function codeSizeBytes(code: `0x${string}` | undefined): number {
  if (!code || code === "0x") return 0;
  // 2 hex chars per byte, minus the leading 0x.
  return (code.length - 2) / 2;
}

/**
 * EIP-7702 delegation designator: an EOA's code is set to exactly
 * `0xef0100 || <20-byte target address>` (23 bytes total). The account
 * stays an EOA but its execution is delegated to the target contract.
 *
 * Returns the delegation target when `code` matches the designator, else
 * `null`.
 */
export function detectDelegation(
  code: `0x${string}` | undefined,
): Address | null {
  if (!code) return null;
  const hex = code.toLowerCase();
  if (hex.length !== 2 + 23 * 2) return null;
  if (!hex.startsWith("0xef0100")) return null;
  try {
    return getAddress(`0x${hex.slice(8)}`) as Address;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-chain fetch
// ---------------------------------------------------------------------------

export async function fetchAddressChainData(
  address: Address,
  client: PublicClient | undefined,
  chain: Chain | undefined,
): Promise<AddressChainData> {
  if (!client) return {};

  const ensSupported =
    !!chain?.contracts?.ensRegistry ||
    !!(chain?.contracts as { ensUniversalResolver?: unknown } | undefined)
      ?.ensUniversalResolver;

  const [code, balance, txCount, ensName] = await Promise.all([
    client.getCode({ address }).catch(() => undefined),
    client.getBalance({ address }).catch(() => undefined),
    client.getTransactionCount({ address }).catch(() => undefined),
    ensSupported
      ? client.getEnsName({ address }).catch(() => null)
      : Promise.resolve<string | null>(null),
  ]);

  return {
    raw: code,
    balance,
    txCount,
    ensName,
  };
}

export async function fetchAddressContractExtras(
  address: Address,
  client: PublicClient,
  chainId: number | undefined,
): Promise<AddressContractExtras> {
  const [implementation, verified] = await Promise.all([
    fetchImplementationAddress(address, client).catch(
      () => undefined as Address | undefined,
    ),
    chainId ? fetchVerifiedContract(chainId, address) : Promise.resolve(null),
  ]);

  let implementationVerified: VerifiedContractInfo | null = null;
  if (implementation && chainId) {
    implementationVerified = await fetchVerifiedContract(
      chainId,
      implementation,
    );
  }

  return {
    implementation,
    verified,
    implementationVerified,
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify an address as EOA / EIP-7702-delegated EOA / contract and
 * gather best-effort metadata: balance, tx count, ENS reverse name,
 * proxy implementation and verified-contract info. Network failures
 * degrade gracefully — a field is simply absent when its source call
 * failed. Returns `null` only for a malformed address.
 */
export async function classifyAddress(
  rawAddress: Address,
  client: PublicClient | undefined,
  chainId: number | undefined,
): Promise<AddressInfo | null> {
  let address: Address;
  try {
    address = getAddress(rawAddress);
  } catch {
    return null;
  }

  const chain = viemChainById(chainId);
  const data = await fetchAddressChainData(address, client, chain);
  const hasCode = !!data.raw && data.raw !== "0x";

  if (!hasCode) {
    return { ...data, address, kind: "eoa", codeSize: 0 };
  }

  // EIP-7702: account holds an `0xef0100 || target` designator. It's
  // still an EOA, just with execution delegated to `target`.
  const delegate = detectDelegation(data.raw);
  if (delegate) {
    const delegateVerified = chainId
      ? await fetchVerifiedContract(chainId, delegate).catch(() => null)
      : null;
    return {
      ...data,
      address,
      kind: "delegated-eoa",
      codeSize: codeSizeBytes(data.raw),
      delegate,
      delegateVerified,
    };
  }

  const extras = client
    ? await fetchAddressContractExtras(address, client, chainId)
    : {};
  return {
    ...data,
    ...extras,
    address,
    kind: "contract",
    codeSize: codeSizeBytes(data.raw),
  };
}
