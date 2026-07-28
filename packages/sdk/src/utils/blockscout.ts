import type { Address } from "../types";
import type { EtherscanSourceResult } from "./contract-verification";

/**
 * Blockscout instances by chain id. Blockscout exposes an
 * Etherscan-compatible API at `https://<host>/api` that needs **no API
 * key**, which makes it the fallback source for verified-contract
 * metadata when `VITE_ETHERSCAN_API_KEY` is unset or Etherscan comes up
 * empty. Hosts verified live 2026-07-28 (the Optimism instances redirect
 * to custom domains — recorded here directly to avoid a hop that drops
 * the query on some HTTP clients).
 */
export const BLOCKSCOUT_HOSTS: Record<number, string> = {
  1: "eth.blockscout.com",
  10: "explorer.optimism.io",
  100: "gnosis.blockscout.com",
  137: "polygon.blockscout.com",
  8453: "base.blockscout.com",
  42161: "arbitrum.blockscout.com",
  11155111: "eth-sepolia.blockscout.com",
  84532: "base-sepolia.blockscout.com",
  421614: "arbitrum-sepolia.blockscout.com",
  11155420: "testnet-explorer.optimism.io",
};

/** Base API URL of the chain's Blockscout instance, or null when none is known. */
export function blockscoutApiUrl(chainId: number): URL | null {
  const host = BLOCKSCOUT_HOSTS[chainId];
  return host ? new URL(`https://${host}/api`) : null;
}

/* Raw shape of a Blockscout `getsourcecode` result entry — mostly
 * Etherscan-compatible, but several fields diverge (observed live):
 *  - `OptimizationUsed` is `"true"/"false"` (Etherscan: `"1"/"0"`)
 *  - runs live in `OptimizationRuns` (and `CompilerSettings.optimizer.runs`)
 *  - `IsProxy`/`ImplementationAddress` instead of `Proxy`/`Implementation`
 *  - `ConstructorArguments` is 0x-prefixed (Etherscan: bare hex)
 *  - multi-file sources come as `FileName`/`SourceCode` plus
 *    `AdditionalSources: [{Filename, SourceCode}]` instead of Etherscan's
 *    double-brace-wrapped Standard JSON
 *  - `ExternalLibraries: [{name, address_hash}]` instead of the `Library`
 *    comma string; no `LicenseType`. */
interface BlockscoutSourceEntry {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  OptimizationRuns?: number | string;
  CompilerSettings?: {
    evmVersion?: string;
    optimizer?: { enabled?: boolean; runs?: number };
    libraries?: Record<string, string>;
    [key: string]: unknown;
  };
  ConstructorArguments?: string;
  EVMVersion?: string;
  ExternalLibraries?: { name?: string; address_hash?: string }[];
  FileName?: string;
  IsProxy?: string;
  ImplementationAddress?: string;
  AdditionalSources?: { Filename?: string; SourceCode?: string }[];
  Address?: string;
}

function normalizeEvmVersion(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Blockscout reports "default" lowercase; Etherscan uses "Default".
  return raw === "default" ? "Default" : raw;
}

function synthesizeStandardJson(entry: BlockscoutSourceEntry): string {
  const sources: Record<string, { content: string }> = {};
  const mainName =
    entry.FileName && entry.FileName !== ".sol"
      ? entry.FileName
      : `${entry.ContractName ?? "Contract"}.sol`;
  if (entry.SourceCode) sources[mainName] = { content: entry.SourceCode };
  for (const extra of entry.AdditionalSources ?? []) {
    if (extra.Filename && typeof extra.SourceCode === "string") {
      sources[extra.Filename] = { content: extra.SourceCode };
    }
  }
  const json = JSON.stringify({
    language: "Solidity",
    sources,
    settings: entry.CompilerSettings ?? {},
  });
  // Etherscan wraps Standard JSON in double braces; downstream parsers
  // (`parseVerifiedSourceFiles`, `verify --mirror`) expect that shape.
  return `{${json}}`;
}

function toEtherscanShape(entry: BlockscoutSourceEntry): EtherscanSourceResult {
  const optimizationUsed =
    entry.OptimizationUsed === "true" ||
    entry.OptimizationUsed === "1" ||
    entry.CompilerSettings?.optimizer?.enabled === true;
  const runs =
    entry.OptimizationRuns ?? entry.CompilerSettings?.optimizer?.runs;

  const library = (entry.ExternalLibraries ?? [])
    .filter((l) => l.name && l.address_hash)
    .map((l) => `${l.name}:${l.address_hash}`)
    .join(",");

  return {
    SourceCode: entry.AdditionalSources?.length
      ? synthesizeStandardJson(entry)
      : entry.SourceCode,
    ABI: entry.ABI,
    ContractName: entry.ContractName,
    CompilerVersion: entry.CompilerVersion,
    OptimizationUsed: optimizationUsed ? "1" : "0",
    Runs: runs !== undefined ? String(runs) : undefined,
    ConstructorArguments: entry.ConstructorArguments?.replace(/^0x/, ""),
    EVMVersion: normalizeEvmVersion(entry.EVMVersion),
    Library: library || undefined,
    LicenseType: undefined,
    Proxy: entry.IsProxy === "true" ? "1" : "0",
    Implementation: entry.ImplementationAddress,
  };
}

/**
 * Fetch verified-contract metadata from the chain's Blockscout instance
 * and normalize it into Etherscan's `getsourcecode` result shape so every
 * downstream parser works unchanged. Returns `null` when the chain has no
 * known Blockscout host, the contract is unverified, or the request fails.
 */
export async function fetchBlockscoutSource(
  chainId: number,
  address: Address,
): Promise<EtherscanSourceResult | null> {
  const url = blockscoutApiUrl(chainId);
  if (!url) return null;

  try {
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getsourcecode");
    url.searchParams.set("address", address);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      result?: BlockscoutSourceEntry[] | string;
    };
    if (json.status !== "1" || !Array.isArray(json.result) || !json.result[0]) {
      return null;
    }
    const entry = json.result[0];
    // Unverified contracts come back as `{ Address: "0x…" }` only.
    if (!entry.ContractName?.trim()) return null;
    return toEtherscanShape(entry);
  } catch {
    return null;
  }
}
