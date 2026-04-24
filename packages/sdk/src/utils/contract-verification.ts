import { getAddress } from "viem";

import type { Address } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A subset of verified-contract metadata that is useful for hover cards and
 * other inline UIs.
 *
 * The data is sourced from Sourcify's public, key-less API — it covers most
 * EVM chains via a single unified endpoint.  Etherscan's v2 API was
 * abandoned because, contrary to its docs, it now requires an API key for
 * every request including read-only `getsourcecode` calls.
 */
export interface VerifiedContractInfo {
  /** Contract name as published to the verifier. */
  name: string;
  /** Solidity/Vyper compiler version, e.g. `0.8.20+commit.a1b79de6`. */
  compilerVersion: string;
  /** Whether the optimizer was enabled when verifying. */
  optimizationUsed: boolean;
  /** Optimizer runs (0 when disabled). */
  runs: number;
  /** SPDX license identifier, when published (e.g. `MIT`). */
  license?: string;
  /**
   * Sourcify's match quality:
   *  - `"perfect"`: deployed bytecode matches exactly (incl. metadata hash).
   *  - `"partial"`: source matches but metadata differs (still trustworthy).
   */
  matchType: "perfect" | "partial";
  /** Reserved for forward compat — Sourcify does not flag proxies. */
  isProxy: boolean;
  /** Reserved for forward compat — implementation comes from on-chain reads. */
  implementation?: Address;
}

interface CacheEntry {
  expires: number;
  value: VerifiedContractInfo | null;
}

// ---------------------------------------------------------------------------
// Caching / dedupe
// ---------------------------------------------------------------------------

/** Keep entries cached for 5 minutes — verified status rarely changes. */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<VerifiedContractInfo | null>>();

const makeKey = (chainId: number, address: Address): string =>
  `${chainId}:${getAddress(address)}`;

function readCache(key: string): VerifiedContractInfo | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh LRU recency.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function writeCache(key: string, value: VerifiedContractInfo | null): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + TTL_MS, value });
}

/** Test-only: drop the in-memory caches. */
export function clearContractVerificationCache(): void {
  cache.clear();
  inflight.clear();
}

// ---------------------------------------------------------------------------
// Network — Sourcify
// ---------------------------------------------------------------------------

const SOURCIFY_FILES_URL = "https://sourcify.dev/server/files/any";

interface SourcifyFile {
  name?: string;
  path?: string;
  content?: string;
}

interface SourcifyResponse {
  status?: "perfect" | "partial";
  files?: SourcifyFile[];
}

/** Shape of the standard Solidity/Vyper compiler-output `metadata.json`. */
interface CompilerMetadata {
  language?: string;
  compiler?: { version?: string };
  settings?: {
    compilationTarget?: Record<string, string>;
    optimizer?: { enabled?: boolean; runs?: number };
    evmVersion?: string;
  };
  sources?: Record<string, { license?: string }>;
}

function pickLicense(meta: CompilerMetadata): string | undefined {
  if (!meta.sources) return undefined;
  for (const src of Object.values(meta.sources)) {
    if (src?.license && src.license.length > 0) return src.license;
  }
  return undefined;
}

function pickContractName(meta: CompilerMetadata): string | undefined {
  const target = meta.settings?.compilationTarget;
  if (!target) return undefined;
  const entries = Object.entries(target);
  if (entries.length === 0) return undefined;
  // Sourcify metadata always has exactly one compilationTarget entry; the
  // value is the contract name we care about.
  return entries[0]?.[1];
}

function parseSourcify(res: SourcifyResponse): VerifiedContractInfo | null {
  if (!res || (res.status !== "perfect" && res.status !== "partial")) {
    return null;
  }
  const metaFile = res.files?.find((f) => f.name === "metadata.json");
  if (!metaFile?.content) return null;

  let meta: CompilerMetadata;
  try {
    meta = JSON.parse(metaFile.content) as CompilerMetadata;
  } catch {
    return null;
  }

  const name = pickContractName(meta);
  if (!name) return null;

  const optimizationUsed = !!meta.settings?.optimizer?.enabled;
  const runs = optimizationUsed
    ? Number(meta.settings?.optimizer?.runs ?? 0) || 0
    : 0;

  return {
    name,
    compilerVersion: meta.compiler?.version ?? "",
    optimizationUsed,
    runs,
    license: pickLicense(meta),
    matchType: res.status,
    isProxy: false,
  };
}

/**
 * Fetch verified-contract metadata for the given chain.
 *
 * Uses Sourcify's public files endpoint (no API key required).  Successful
 * and `null` responses are cached in-memory for a few minutes, and
 * concurrent calls for the same `(chainId, address)` are deduped.
 *
 * Returns `null` when:
 *  - The contract is not verified on Sourcify.
 *  - The chain isn't supported by Sourcify.
 *  - The endpoint is unreachable or rate-limited.
 */
export async function fetchVerifiedContract(
  chainId: number,
  address: Address,
): Promise<VerifiedContractInfo | null> {
  const key = makeKey(chainId, address);

  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<VerifiedContractInfo | null> => {
    try {
      const url = `${SOURCIFY_FILES_URL}/${chainId}/${getAddress(address)}`;
      const res = await fetch(url);
      if (!res.ok) return null; // 404 = unverified, 429 = rate limited, etc.
      const json = (await res.json()) as SourcifyResponse;
      return parseSourcify(json);
    } catch {
      return null;
    }
  })();

  inflight.set(key, promise);
  try {
    const value = await promise;
    writeCache(key, value);
    return value;
  } finally {
    inflight.delete(key);
  }
}
