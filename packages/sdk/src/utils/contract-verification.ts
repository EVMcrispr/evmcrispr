import { getAddress } from "viem";

import type { Address } from "../types";
import { fetchBlockscoutSource } from "./blockscout";

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
 * read from `VITE_ETHERSCAN_API_KEY`. When it isn't set — or Etherscan
 * comes up empty — the chain's Blockscout instance (keyless, see
 * `blockscout.ts`) is tried as a fallback; lookups only return `null`
 * when both sources miss, so unverified UI degrades gracefully.
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
export function readEtherscanApiKey(): string | undefined {
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
 *  here and parse on demand.
 *
 *  This type is exported because the `verify` command in `@evmcrispr/module-contracts`
 *  needs the **full** payload (source code, constructor args, EVM
 *  version, libraries, license) to mirror an existing verification to
 *  another chain. The slim `VerifiedContractInfo` is a subset of these
 *  fields used by the hover UI. */
export interface EtherscanSourceResult {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Runs?: string;
  ConstructorArguments?: string;
  EVMVersion?: string;
  Library?: string;
  LicenseType?: string;
  Proxy?: string;
  Implementation?: string;
  SwarmSource?: string;
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

/** Pull the single verified entry out of a `getsourcecode` envelope, or
 * `null` for unverified contracts (status "1" but `ABI === "Contract
 * source code not verified"` and no `ContractName`). */
function extractEntry(
  res: EtherscanSourceResponse,
): EtherscanSourceResult | null {
  if (res.status !== "1" || !Array.isArray(res.result) || !res.result[0]) {
    return null;
  }
  const entry = res.result[0];
  if (!entry.ContractName?.trim()) return null;
  if (entry.ABI === "Contract source code not verified") return null;
  return entry;
}

function entryToInfo(entry: EtherscanSourceResult): VerifiedContractInfo {
  const name = entry.ContractName?.trim() ?? "";
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

/** Fetch a verified entry from Etherscan V2. Returns `null` when the key
 * is unset, the contract is unverified, the chain is unsupported, or the
 * request failed — callers fall back to Blockscout. */
async function fetchEtherscanEntry(
  chainId: number,
  address: Address,
): Promise<EtherscanSourceResult | null> {
  const apiKey = readEtherscanApiKey();
  if (!apiKey) return null;

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
    return extractEntry(json);
  } catch {
    return null;
  }
}

/** Etherscan first (when a key is configured), then the chain's Blockscout
 * instance — both normalized to the Etherscan result shape. */
async function fetchVerifiedEntry(
  chainId: number,
  address: Address,
): Promise<EtherscanSourceResult | null> {
  return (
    (await fetchEtherscanEntry(chainId, address)) ??
    fetchBlockscoutSource(chainId, getAddress(address))
  );
}

/**
 * Fetch verified-contract metadata for the given chain.
 *
 * Tries Etherscan's V2 unified endpoint (with `VITE_ETHERSCAN_API_KEY`),
 * falling back to the chain's Blockscout instance, which needs no key.
 * Successful and `null` responses are cached in-memory for a few minutes,
 * and concurrent calls for the same `(chainId, address)` are deduped.
 *
 * Returns `null` when the contract is verified on neither source (or
 * neither source is reachable/configured for the chain).
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
    const entry = await fetchVerifiedEntry(chainId, address);
    return entry ? entryToInfo(entry) : null;
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

// ---------------------------------------------------------------------------
// Full payload fetch — used by `contracts:verify` to mirror an existing
// verification onto another chain.
// ---------------------------------------------------------------------------

/**
 * Fetch the **complete** verified-contract payload for the given chain
 * and address. Returns the raw `EtherscanSourceResult` shape, including
 * `SourceCode`, `ConstructorArguments`, `EVMVersion`, `Library`, and
 * `LicenseType` — fields the slim `fetchVerifiedContract` doesn't expose.
 * Tries Etherscan first, then the chain's Blockscout instance (whose
 * response is normalized into the same shape, multi-file sources
 * included).
 *
 * Returns `null` when neither source has the contract. This call is
 * **uncached** because the response can be large (full source code) and
 * is typically only read once, when a user explicitly invokes
 * `verify --mirror-chain ...`.
 */
export async function fetchVerifiedContractFull(
  chainId: number,
  address: Address,
): Promise<EtherscanSourceResult | null> {
  return fetchVerifiedEntry(chainId, address);
}

// ---------------------------------------------------------------------------
// Contract creation payload — used by `contracts:deploy` to mirror an existing
// deployment onto another chain.
// ---------------------------------------------------------------------------

/**
 * Shape of a single result entry in `getcontractcreation`. Etherscan's
 * V2 endpoint returns the original creation bytecode (init code with
 * constructor args appended) along with creator/factory metadata, which
 * is exactly what we need to faithfully replay a deployment on another
 * chain.
 *
 * `contractFactory` is non-empty when the contract was deployed via
 * another contract (e.g. a CREATE2 factory). In that case
 * `creationBytecode` is still the **init code** that ran inside the
 * factory's CREATE/CREATE2 — i.e. it remains the right value to feed
 * into `deploy`.
 */
export interface EtherscanCreationResult {
  contractAddress: string;
  contractCreator?: string;
  txHash?: string;
  blockNumber?: string;
  timestamp?: string;
  contractFactory?: string;
  creationBytecode?: string;
}

interface EtherscanCreationResponse {
  status: string;
  message?: string;
  result?: EtherscanCreationResult[] | string;
}

/**
 * Fetch the original creation bytecode (and creator/factory metadata)
 * for a deployed contract. Uses Etherscan V2's `getcontractcreation`
 * endpoint, which returns the **init code** the EVM ran when the
 * contract was created — including any ABI-encoded constructor args
 * appended by the deployer. Replaying this byte-for-byte on another
 * chain reproduces the original deployment.
 *
 * Returns `null` when `VITE_ETHERSCAN_API_KEY` is unset, the address
 * isn't found, the response omits `creationBytecode` (older Etherscan
 * snapshots), or the request fails. Uncached for the same reason as
 * `fetchVerifiedContractFull` — bytecode payloads can be large and are
 * typically read once per `deploy --source-...`.
 */
export async function fetchContractCreation(
  chainId: number,
  address: Address,
): Promise<EtherscanCreationResult | null> {
  const apiKey = readEtherscanApiKey();
  if (!apiKey) return null;

  try {
    const url = new URL(ETHERSCAN_V2_URL);
    url.searchParams.set("chainid", String(chainId));
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getcontractcreation");
    url.searchParams.set("contractaddresses", getAddress(address));
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as EtherscanCreationResponse;
    if (json.status !== "1" || !Array.isArray(json.result) || !json.result[0]) {
      return null;
    }
    return json.result[0];
  } catch {
    return null;
  }
}
