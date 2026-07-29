import { getAddress } from "viem";

import type { Address } from "../types";
import { blockscoutApiUrl } from "./blockscout";
import { readEtherscanApiKey } from "./contract-verification";

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

/**
 * One entry of an address's transaction history, as reported by the
 * explorer's `account/txlist` endpoint (Etherscan and Blockscout share
 * the field names). Newest first.
 */
export interface AddressTxSummary {
  hash: `0x${string}`;
  from: Address;
  /** Empty for contract-creation transactions. */
  to?: Address;
  /** Value in wei (decimal string). */
  value: string;
  blockNumber: number;
  /** Unix seconds. */
  timestamp: number;
  /** True when the transaction reverted. */
  isError: boolean;
  /** Human-readable function name when the explorer knows it (Etherscan only). */
  functionName?: string;
  /** 4-byte selector of the call, when present. */
  methodId?: string;
}

interface RawTxlistEntry {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  blockNumber?: string;
  timeStamp?: string;
  isError?: string;
  txreceipt_status?: string;
  functionName?: string;
  methodId?: string;
}

interface TxlistResponse {
  status?: string;
  result?: RawTxlistEntry[] | string;
}

/* Histories change with every new transaction — cache only briefly. */
const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 50;
const cache = new Map<
  string,
  { expires: number; value: AddressTxSummary[] | null }
>();

/** Test-only: drop the in-memory tx-history cache. */
export function clearAddressTransactionsCache(): void {
  cache.clear();
}

function parseEntries(json: TxlistResponse): AddressTxSummary[] | null {
  // Etherscan reports "no transactions found" as status "0" with an empty
  // result array — that's a valid empty history, not a failure.
  if (!Array.isArray(json.result)) return null;
  const entries: AddressTxSummary[] = [];
  for (const raw of json.result) {
    if (!raw.hash || !raw.from) continue;
    entries.push({
      hash: raw.hash as `0x${string}`,
      from: raw.from as Address,
      to: raw.to ? (raw.to as Address) : undefined,
      value: raw.value ?? "0",
      blockNumber: Number(raw.blockNumber ?? 0),
      timestamp: Number(raw.timeStamp ?? 0),
      isError: raw.isError === "1" || raw.txreceipt_status === "0",
      functionName: raw.functionName || undefined,
      methodId: raw.methodId || undefined,
    });
  }
  return entries;
}

async function fetchTxlist(url: URL): Promise<AddressTxSummary[] | null> {
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return parseEntries((await res.json()) as TxlistResponse);
  } catch {
    return null;
  }
}

function withTxlistParams(url: URL, address: Address, limit: number): URL {
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(limit));
  return url;
}

/**
 * Fetch an address's most recent transactions (newest first) from
 * Etherscan V2 (when `VITE_ETHERSCAN_API_KEY` is set), falling back to
 * the chain's Blockscout instance, which needs no key.
 *
 * Returns `null` when no source could answer (no key AND no Blockscout
 * host for the chain, or both requests failed) — distinct from an empty
 * array, which means the address genuinely has no transactions.
 */
export async function fetchAddressTransactions(
  chainId: number,
  address: Address,
  limit = 10,
): Promise<AddressTxSummary[] | null> {
  const normalized = getAddress(address.toLowerCase() as Address);
  const key = `${chainId}:${normalized}:${limit}`;

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value: AddressTxSummary[] | null = null;

  const apiKey = readEtherscanApiKey();
  if (apiKey) {
    const url = withTxlistParams(new URL(ETHERSCAN_V2_URL), normalized, limit);
    url.searchParams.set("chainid", String(chainId));
    url.searchParams.set("apikey", apiKey);
    value = await fetchTxlist(url);
  }

  if (value === null) {
    const base = blockscoutApiUrl(chainId);
    if (base)
      value = await fetchTxlist(withTxlistParams(base, normalized, limit));
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  return value;
}
