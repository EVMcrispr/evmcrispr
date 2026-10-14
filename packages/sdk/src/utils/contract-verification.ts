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
 * The Etherscan API key of whoever runs this process: the CLI, the MCP
 * server and tests read `process.env.VITE_ETHERSCAN_API_KEY` at runtime.
 *
 * A browser has no such thing, on purpose: a key compiled into a web
 * bundle can be read out of it, so `import.meta.env` is never consulted.
 * A web host reaches Etherscan through a proxy that holds the key instead
 * (see {@link setEtherscanProxy}).
 */
export function readEtherscanApiKey(): string | undefined {
  const key =
    typeof process !== "undefined"
      ? process.env?.VITE_ETHERSCAN_API_KEY
      : undefined;
  return key && key.length > 0 ? key : undefined;
}

// ---------------------------------------------------------------------------
// Network — Etherscan V2
// ---------------------------------------------------------------------------

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

/**
 * The EVMcrispr API's Etherscan route: the same query as Etherscan's V2
 * endpoint minus the key, which the service adds. A host that ships no key
 * hands this to {@link setEtherscanProxy}.
 */
export const ETHERSCAN_PROXY_URL = "https://api.evmcrispr.com/etherscan";

let etherscanProxy: string | undefined;

/**
 * Send keyless Etherscan requests through `url` from here on (`undefined`
 * to stop). Nothing is set by default: without a key or a proxy, Etherscan
 * is simply not asked and lookups fall back to Blockscout.
 */
export function setEtherscanProxy(url: string | undefined): void {
  etherscanProxy = url;
}

/** Whether Etherscan can be asked at all: with a key, or through a proxy. */
export function hasEtherscanAccess(): boolean {
  return readEtherscanApiKey() !== undefined || etherscanProxy !== undefined;
}

/**
 * The URL of an Etherscan V2 request for `module`/`action` on `chainId`,
 * ready for its remaining parameters: straight to Etherscan with a key of
 * one's own, through the proxy without. `undefined` when there is neither.
 */
export function etherscanUrl(
  chainId: number,
  module: string,
  action: string,
): URL | undefined {
  const apiKey = readEtherscanApiKey();
  if (!apiKey && !etherscanProxy) return undefined;
  const url = new URL(apiKey ? ETHERSCAN_V2_URL : (etherscanProxy as string));
  if (apiKey) url.searchParams.set("apikey", apiKey);
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("module", module);
  url.searchParams.set("action", action);
  return url;
}

// ---------------------------------------------------------------------------
// Network — the keyless path: Sourcify, then the EVMcrispr API
// ---------------------------------------------------------------------------
//
// With neither an Etherscan key nor a proxy, a contract is looked up on
// Sourcify first (keyless, CORS-open and fast), then on the EVMcrispr
// API's `/contract` and `/source` routes (Sourcify, Etherscan with a key
// kept on the server, Blockscout), then on Blockscout directly. With a key
// or a proxy, neither is asked: Etherscan comes first, as it always has.

/** Sourcify's server, whose v2 API answers verified contracts. */
export const SOURCIFY_URL = "https://sourcify.dev/server";

let sourcifyApi: string | undefined = SOURCIFY_URL;

/**
 * Ask `url` (a Sourcify server base, without a trailing slash) first for
 * verified contracts when there is no Etherscan key and no proxy, or
 * `undefined` not to ask Sourcify. Set to {@link SOURCIFY_URL} by default.
 */
export function setSourcifyApi(url: string | undefined): void {
  sourcifyApi = url?.replace(/\/+$/, "");
}

/** The parts of Sourcify's `GET /v2/contract/<chainId>/<address>` answer
 * read here. `match` is `"match"` or `"exact_match"` for a verified
 * contract (both count: the name and the source are right either way). */
export interface SourcifyContract {
  match?: string | null;
  abi?: unknown[];
  compilation?: {
    name?: string;
    compilerVersion?: string;
    compilerSettings?: {
      optimizer?: { enabled?: boolean; runs?: number };
      evmVersion?: string;
    };
  };
  sources?: Record<string, { content?: string }>;
  proxyResolution?: { isProxy?: boolean } | null;
}

/**
 * A verified contract from Sourcify with the given `fields`, or `null`
 * when it is not to be asked (a key or a proxy reaches Etherscan, or
 * Sourcify is switched off) or has no answer (`404` for unverified, an
 * unsupported chain, a rate limit, a network error).
 */
export async function fetchSourcifyContract(
  chainId: number,
  address: Address,
  fields: string,
): Promise<SourcifyContract | null> {
  if (!sourcifyApi || hasEtherscanAccess()) return null;
  try {
    const res = await fetch(
      `${sourcifyApi}/v2/contract/${chainId}/${getAddress(address)}?fields=${fields}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as SourcifyContract;
    if (!json.match || !json.compilation?.name?.trim()) return null;
    return json;
  } catch {
    return null;
  }
}

function sourcifyToInfo(contract: SourcifyContract): VerifiedContractInfo {
  const compilation = contract.compilation ?? {};
  const optimizer = compilation.compilerSettings?.optimizer;
  const optimizationUsed = optimizer?.enabled === true;
  return {
    name: compilation.name?.trim() ?? "",
    compilerVersion: normalizeCompilerVersion(compilation.compilerVersion),
    optimizationUsed,
    runs: optimizationUsed ? Number(optimizer?.runs ?? 0) || 0 : 0,
    license: undefined,
    matchType: contract.match === "exact_match" ? "perfect" : "partial",
    isProxy: contract.proxyResolution?.isProxy === true,
    // Sourcify names implementations, but they change on upgrade; the
    // proxy detection reads them on-chain, as for the API.
    implementation: undefined,
  };
}

/**
 * The EVMcrispr API, whose `/contract/<chainId>/<address>` and
 * `/source/<chainId>/<address>` routes answer a contract's verified
 * metadata and source, looked up on Sourcify, then on Etherscan with a
 * key kept on the server, then on Blockscout. Asked when this process has
 * neither a key nor a proxy, after Sourcify and before Blockscout.
 */
export const CONTRACT_API_URL = "https://api.evmcrispr.com";

let contractApi: string | undefined = CONTRACT_API_URL;

/**
 * Ask `url` (an EVMcrispr API base, without a trailing slash) for
 * verified contracts when there is no Etherscan key and no proxy, or
 * `undefined` to go straight to Blockscout. Set to
 * {@link CONTRACT_API_URL} by default.
 */
export function setContractApi(url: string | undefined): void {
  contractApi = url?.replace(/\/+$/, "");
}

/** What `/contract/<chainId>/<address>` answers for a verified contract.
 * A proxy's implementation is not in it (it changes on upgrade): read it
 * on-chain. */
export interface ContractApiMetadata {
  name: string;
  abi: unknown[];
  compilerVersion: string;
  optimizationUsed: boolean;
  runs: number;
  evmVersion?: string;
  license?: string;
  isProxy: boolean;
  files: string[];
}

/** What `/source/<chainId>/<address>` answers: the same metadata, with
 * the files' contents (path → content) in place of their paths. */
export interface ContractApiSource extends Omit<ContractApiMetadata, "files"> {
  files: Record<string, string>;
}

/**
 * GET one of the API's contract routes, or `null` when it is not to be
 * asked (a key or a proxy reaches Etherscan directly, or the API is
 * switched off) or has no answer (`404` for unverified, a rate limit, a
 * network error). Callers fall back to Blockscout.
 */
export async function fetchContractApi<T>(
  route: "contract" | "source",
  chainId: number,
  address: Address,
): Promise<T | null> {
  if (!contractApi || hasEtherscanAccess()) return null;
  try {
    const res = await fetch(
      `${contractApi}/${route}/${chainId}/${getAddress(address)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function apiMetadataToInfo(meta: ContractApiMetadata): VerifiedContractInfo {
  const optimizationUsed = meta.optimizationUsed === true;
  return {
    name: meta.name?.trim() ?? "",
    compilerVersion: normalizeCompilerVersion(meta.compilerVersion),
    optimizationUsed,
    runs: optimizationUsed ? Number(meta.runs ?? 0) || 0 : 0,
    license: normalizeLicense(meta.license),
    matchType: "perfect",
    isProxy: meta.isProxy === true,
    // The API leaves it out on purpose; see `ContractApiMetadata`.
    implementation: undefined,
  };
}

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

/** Fetch a verified entry from Etherscan V2. Returns `null` when Etherscan
 * cannot be asked (no key, no proxy), the contract is unverified, the chain
 * is unsupported, or the request failed — callers fall back to Blockscout. */
async function fetchEtherscanEntry(
  chainId: number,
  address: Address,
): Promise<EtherscanSourceResult | null> {
  const url = etherscanUrl(chainId, "contract", "getsourcecode");
  if (!url) return null;

  try {
    url.searchParams.set("address", getAddress(address));

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
 * Tries Etherscan's V2 unified endpoint (with `VITE_ETHERSCAN_API_KEY`, or
 * through the proxy of {@link setEtherscanProxy}); with neither, Sourcify
 * (see {@link setSourcifyApi}) and then the EVMcrispr API's `/contract`
 * route (see {@link setContractApi}). Either way it falls back to the
 * chain's Blockscout instance, which needs no key.
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
    const sourcify = await fetchSourcifyContract(
      chainId,
      address,
      "compilation,proxyResolution",
    );
    if (sourcify) return sourcifyToInfo(sourcify);
    const meta = await fetchContractApi<ContractApiMetadata>(
      "contract",
      chainId,
      address,
    );
    if (meta?.name) return apiMetadataToInfo(meta);
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
 * Returns `null` when Etherscan cannot be asked (no key, no proxy), the
 * address isn't found, the response omits `creationBytecode` (older Etherscan
 * snapshots), or the request fails. Uncached for the same reason as
 * `fetchVerifiedContractFull` — bytecode payloads can be large and are
 * typically read once per `deploy --source-...`.
 */
export async function fetchContractCreation(
  chainId: number,
  address: Address,
): Promise<EtherscanCreationResult | null> {
  const url = etherscanUrl(chainId, "contract", "getcontractcreation");
  if (!url) return null;

  try {
    url.searchParams.set("contractaddresses", getAddress(address));

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
