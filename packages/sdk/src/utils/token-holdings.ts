import { getAddress, isAddress } from "viem";

import type { Address } from "../types";
import { BLOCKSCOUT_HOSTS } from "./blockscout";

/**
 * One ERC-20 an address holds, as reported by the explorer. The balance
 * is the explorer's indexed view and may lag the chain by a few blocks:
 * read the live amount with `balanceOf` before spending it.
 */
export interface TokenHolding {
  token: Address;
  symbol?: string;
  decimals?: number;
  /** Indexed balance in base units. */
  balance: bigint;
}

/* Blockscout v2 `addresses/{hash}/token-balances` entry (observed live;
 * older instances spell the token address `address`, newer `address_hash`). */
interface RawTokenBalance {
  value?: string;
  token?: {
    address?: string;
    address_hash?: string;
    symbol?: string | null;
    decimals?: string | null;
    type?: string;
  };
}

/* Holdings change with every transfer — cache only briefly. */
const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 50;
const cache = new Map<
  string,
  { expires: number; value: TokenHolding[] | null }
>();

/** Test-only: drop the in-memory holdings cache. */
export function clearTokenHoldingsCache(): void {
  cache.clear();
}

function parseHoldings(json: unknown): TokenHolding[] | null {
  if (!Array.isArray(json)) return null;
  const holdings: TokenHolding[] = [];
  for (const raw of json as RawTokenBalance[]) {
    const token = raw.token?.address_hash ?? raw.token?.address;
    if (!token || !isAddress(token)) continue;
    // Only fungible tokens: NFTs and multi-tokens have no single balance
    // that a swap or transfer could spend.
    if (raw.token?.type !== "ERC-20") continue;
    let balance: bigint;
    try {
      balance = BigInt(raw.value ?? "0");
    } catch {
      continue;
    }
    if (balance <= 0n) continue;
    const decimals =
      raw.token?.decimals == null ? undefined : Number(raw.token.decimals);
    holdings.push({
      token: getAddress(token),
      symbol: raw.token?.symbol ?? undefined,
      decimals: Number.isInteger(decimals) ? decimals : undefined,
      balance,
    });
  }
  return holdings;
}

/**
 * Fetch the ERC-20 tokens an address holds with a nonzero balance from the
 * chain's Blockscout instance (keyless), in the explorer's order (by fiat
 * value where it knows one).
 *
 * Returns `null` when no source could answer (no Blockscout host for the
 * chain, or the request failed) — distinct from an empty array, which
 * means the address genuinely holds no ERC-20.
 */
export async function fetchTokenHoldings(
  chainId: number,
  address: Address,
): Promise<TokenHolding[] | null> {
  const normalized = getAddress(address.toLowerCase() as Address);
  const key = `${chainId}:${normalized}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value: TokenHolding[] | null = null;
  const host = BLOCKSCOUT_HOSTS[chainId];
  if (host) {
    try {
      const res = await fetch(
        `https://${host}/api/v2/addresses/${normalized}/token-balances`,
      );
      if (res.ok) value = parseHoldings(await res.json());
    } catch {
      value = null;
    }
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  return value;
}
