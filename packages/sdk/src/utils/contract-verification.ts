import { getAddress } from "viem";

import type { Address } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A subset of verified-contract metadata that is useful for hover cards
 * and other inline UIs.
 *
 * Sourced from Etherscan's V2 unified API (`https://api.etherscan.io/v2`),
 * which covers all supported chains via a single `chainid` parameter and
 * requires an API key (free tier: 5 req/s, 100k req/day). The key is
 * read from `VITE_ETHERSCAN_API_KEY` — when it isn't set, this module
 * silently returns `null` for every lookup so unverified UI degrades
 * gracefully.
 */
export interface VerifiedContractInfo {
  /** Contract name as published to Etherscan. */
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
   * Match quality. Etherscan only exposes verified contracts (no notion
   * of partial match) — kept on the type for parity with the previous
   * Sourcify-backed shape, but always `"perfect"` here.
   */
  matchType: "perfect" | "partial";
  /** Etherscan's own proxy flag. We don't rely on it — proxy detection
   * is done by `fetchImplementationAddress` against on-chain bytecode. */
  isProxy: boolean;
  /** Implementation address as reported by Etherscan, when present. */
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
// Env-based API key resolution
// ---------------------------------------------------------------------------

/**
 * Pull the Etherscan API key from whichever runtime is hosting us:
 *  - In Vite-built browser bundles, `import.meta.env.VITE_ETHERSCAN_API_KEY`
 *    is statically replaced at build time.
 *  - In Node/Bun (CLI, MCP, tests), `process.env.VITE_ETHERSCAN_API_KEY`
 *    is read at runtime.
 *
 * Returns `undefined` when no key is configured, which makes
 * `fetchVerifiedContract` a no-op.
 */
function readEtherscanApiKey(): string | undefined {
  let key: string | undefined;
  try {
    key = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env?.VITE_ETHERSCAN_API_KEY;
  } catch {
    /* `import.meta.env` is undefined outside Vite — fall through. */
  }
  if (!key && typeof process !== "undefined") {
    key = process.env?.VITE_ETHERSCAN_API_KEY;
  }
  return key && key.length > 0 ? key : undefined;
}

// ---------------------------------------------------------------------------
// Network — Etherscan V2
// ---------------------------------------------------------------------------

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

/** Shape of a single result entry in `getsourcecode`. Etherscan returns
 *  every numeric field as a string, so we deliberately keep them as such
 *  here and parse on demand. */
interface EtherscanSourceResult {
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Runs?: string;
  LicenseType?: string;
  Proxy?: string;
  Implementation?: string;
  ABI?: string;
}

interface EtherscanSourceResponse {
  status: string;
  message?: string;
  result?: EtherscanSourceResult[] | string;
}

function normalizeCompilerVersion(raw: string | undefined): string {
  if (!raw) return "";
  // Etherscan prefixes Solidity versions with `v` (e.g. `v0.8.20+...`).
  return raw.startsWith("v") ? raw.slice(1) : raw;
}

function normalizeLicense(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Etherscan uses "None" for unspecified licenses; treat that as missing.
  if (raw === "None" || raw === "Unlicense") return undefined;
  return raw;
}

function parseEtherscan(
  res: EtherscanSourceResponse,
): VerifiedContractInfo | null {
  if (res.status !== "1" || !Array.isArray(res.result) || !res.result[0]) {
    return null;
  }
  const entry = res.result[0];
  const name = entry.ContractName?.trim();
  // Unverified contracts come back with status "1" but ABI === "Contract
  // source code not verified" and no ContractName.
  if (!name || entry.ABI === "Contract source code not verified") return null;

  const optimizationUsed = entry.OptimizationUsed === "1";
  const runs = optimizationUsed ? Number(entry.Runs ?? 0) || 0 : 0;
  const isProxy = entry.Proxy === "1";

  let implementation: Address | undefined;
  if (entry.Implementation && entry.Implementation !== "") {
    try {
      implementation = getAddress(entry.Implementation as `0x${string}`);
    } catch {
      /* ignore malformed implementation addresses */
    }
  }

  return {
    name,
    compilerVersion: normalizeCompilerVersion(entry.CompilerVersion),
    optimizationUsed,
    runs,
    license: normalizeLicense(entry.LicenseType),
    matchType: "perfect",
    isProxy,
    implementation,
  };
}

/**
 * Fetch verified-contract metadata for the given chain.
 *
 * Uses Etherscan's V2 unified endpoint and the `VITE_ETHERSCAN_API_KEY`
 * env var. Successful and `null` responses are cached in-memory for
 * a few minutes, and concurrent calls for the same `(chainId, address)`
 * are deduped.
 *
 * Returns `null` when:
 *  - `VITE_ETHERSCAN_API_KEY` is not set.
 *  - The contract is not verified on Etherscan.
 *  - Etherscan doesn't support the chain or rate-limited the request.
 */
export async function fetchVerifiedContract(
  chainId: number,
  address: Address,
): Promise<VerifiedContractInfo | null> {
  const apiKey = readEtherscanApiKey();
  if (!apiKey) return null;

  const key = makeKey(chainId, address);

  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<VerifiedContractInfo | null> => {
    try {
      const url = new URL(ETHERSCAN_V2_URL);
      url.searchParams.set("chainid", String(chainId));
      url.searchParams.set("module", "contract");
      url.searchParams.set("action", "getsourcecode");
      url.searchParams.set("address", getAddress(address));
      url.searchParams.set("apikey", apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const json = (await res.json()) as EtherscanSourceResponse;
      return parseEtherscan(json);
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
