import { formatAbi } from "abitype";
import { getAddress } from "viem";

import type { Address } from "../types";
import {
  type EtherscanSourceResult,
  fetchVerifiedContractFull,
} from "./contract-verification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed verified-contract source, shaped for AI tools (the terminal chat
 * panel and the MCP server) that let a model read a contract before writing
 * EVML against it. Unlike the raw `EtherscanSourceResult`, the source is
 * split into individual files so consumers can serve them one at a time
 * instead of dumping a whole flattened Standard JSON into a model context.
 */
export interface ContractSource {
  /** Contract name as published to Etherscan. */
  name: string;
  /** Compiler version without the `v` prefix, e.g. `0.8.20+commit.a1b79de6`. */
  compilerVersion: string;
  /** Whether the optimizer was enabled when verifying. */
  optimizationUsed: boolean;
  /** Optimizer runs (0 when disabled). */
  runs: number;
  /** EVM version when explicitly set (absent for `Default`). */
  evmVersion?: string;
  /** SPDX license identifier, when published. */
  license?: string;
  /** Etherscan's proxy flag. */
  isProxy: boolean;
  /** Implementation address as reported by Etherscan, when present. */
  implementation?: Address;
  /** Human-readable ABI signatures (abitype `formatAbi`). */
  abi: readonly string[];
  /** Source files: path → Solidity content. */
  files: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Caching / dedupe
// ---------------------------------------------------------------------------

/* `fetchVerifiedContractFull` is deliberately uncached (large payloads),
 * but the tool flow reads the same contract several times in a row —
 * manifest first, then individual files — so the parsed result is cached
 * here instead. */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 20;

interface CacheEntry {
  expires: number;
  value: ContractSource | null;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ContractSource | null>>();

/** Test-only: drop the in-memory caches. */
export function clearContractSourceCache(): void {
  cache.clear();
  inflight.clear();
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Split Etherscan's `SourceCode` field into a path → content map. The
 * field comes back in three shapes (see `normalizeMirrorSourceToStandardJson`
 * in `@evmcrispr/module-contracts`): a double-brace-wrapped Standard JSON
 * Input, a flat multi-file dict, or plain single-file Solidity text.
 */
export function parseVerifiedSourceFiles(
  entry: EtherscanSourceResult,
): Record<string, string> {
  const raw = (entry.SourceCode ?? "").trim();
  if (!raw) return {};

  let json: string | undefined;
  if (raw.startsWith("{{") && raw.endsWith("}}")) json = raw.slice(1, -1);
  else if (raw.startsWith("{")) json = raw;

  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        sources?: Record<string, { content?: string }>;
      };
      const dict =
        parsed.sources ??
        (parsed as Record<string, { content?: string } | undefined>);
      const files: Record<string, string> = {};
      for (const [path, value] of Object.entries(dict)) {
        if (value && typeof value.content === "string") {
          files[path] = value.content;
        }
      }
      if (Object.keys(files).length > 0) return files;
    } catch {
      /* fall through to single-file wrap */
    }
  }

  return { [`${entry.ContractName?.trim() || "Contract"}.sol`]: raw };
}

function parseAbiSignatures(abiJson: string | undefined): readonly string[] {
  if (!abiJson) return [];
  try {
    return formatAbi(JSON.parse(abiJson));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch and parse the verified source of a contract from Etherscan V2.
 *
 * Returns `null` under the same conditions as `fetchVerifiedContractFull`
 * (no `VITE_ETHERSCAN_API_KEY`, contract not verified, unsupported chain,
 * network error). Results are cached in-memory for a few minutes and
 * concurrent calls for the same `(chainId, address)` are deduped.
 */
export async function fetchContractSource(
  chainId: number,
  address: Address,
): Promise<ContractSource | null> {
  // Tool inputs come from language models, which routinely mangle EIP-55
  // casing — lowercase before checksumming instead of rejecting.
  const normalized = getAddress(address.toLowerCase() as Address);
  const key = `${chainId}:${normalized}`;

  const hit = cache.get(key);
  if (hit) {
    if (hit.expires > Date.now()) return hit.value;
    cache.delete(key);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ContractSource | null> => {
    const entry = await fetchVerifiedContractFull(chainId, normalized);
    if (!entry) return null;

    let implementation: Address | undefined;
    if (entry.Implementation) {
      try {
        implementation = getAddress(entry.Implementation as `0x${string}`);
      } catch {
        /* ignore malformed implementation addresses */
      }
    }

    const optimizationUsed = entry.OptimizationUsed === "1";
    const license = entry.LicenseType?.trim();
    return {
      name: entry.ContractName?.trim() || "Contract",
      compilerVersion: (entry.CompilerVersion ?? "").replace(/^v/, ""),
      optimizationUsed,
      runs: optimizationUsed ? Number(entry.Runs ?? 0) || 0 : 0,
      evmVersion:
        entry.EVMVersion && entry.EVMVersion !== "Default"
          ? entry.EVMVersion
          : undefined,
      license: license && license !== "None" ? license : undefined,
      isProxy: entry.Proxy === "1",
      implementation,
      abi: parseAbiSignatures(entry.ABI),
      files: parseVerifiedSourceFiles(entry),
    };
  })();

  inflight.set(key, promise);
  try {
    const value = await promise;
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { expires: Date.now() + TTL_MS, value });
    return value;
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Default character budget for a rendered result; keeps tool results
 * model-sized even for flattened single-file verifications. */
export const CONTRACT_SOURCE_CHAR_BUDGET = 40_000;

function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const dropped = text.length - budget;
  return `${text.slice(0, budget)}\n\n[Truncated at ${budget} characters (${dropped} more not shown).]`;
}

function kb(chars: number): string {
  return `${(chars / 1000).toFixed(chars < 10_000 ? 1 : 0)} kB`;
}

/**
 * Render a `ContractSource` as tool-output text.
 *
 * Without `file`, returns an overview: name, compiler settings, proxy
 * note, human-readable ABI, and the list of source files — with a hint
 * to request individual files. With `file`, returns that file's content
 * (matched exactly, or by unique basename so `ERC20.sol` finds
 * `@openzeppelin/contracts/token/ERC20/ERC20.sol`).
 */
export function renderContractSource(
  source: ContractSource,
  options: { file?: string; charBudget?: number } = {},
): string {
  const budget = options.charBudget ?? CONTRACT_SOURCE_CHAR_BUDGET;
  const paths = Object.keys(source.files);

  if (options.file) {
    let path = paths.find((p) => p === options.file);
    if (!path) {
      const matches = paths.filter(
        (p) => p === options.file || p.endsWith(`/${options.file}`),
      );
      if (matches.length === 1) path = matches[0];
      else if (matches.length > 1)
        return `ERROR: "${options.file}" is ambiguous — it matches:\n${matches.join("\n")}\nPass the full path.`;
    }
    if (!path)
      return `ERROR: no source file "${options.file}" in ${source.name}. Available files:\n${paths.join("\n")}`;
    return truncate(
      `// ${path} — ${source.name}\n${source.files[path]}`,
      budget,
    );
  }

  const settings = [
    `Compiler: ${source.compilerVersion || "unknown"}`,
    source.optimizationUsed
      ? `optimizer: ${source.runs} runs`
      : "optimizer: off",
    source.evmVersion ? `EVM: ${source.evmVersion}` : undefined,
    source.license ? `License: ${source.license}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");

  const lines: string[] = [`${source.name} (verified on Etherscan)`, settings];

  if (source.isProxy || source.implementation) {
    lines.push(
      source.implementation
        ? `NOTE: this contract is a proxy; its logic lives in the implementation at ${source.implementation}. Call this tool again with that address to read the implementation's ABI and source.`
        : "NOTE: this contract is a proxy; read the implementation contract for its logic.",
    );
  }

  lines.push(
    "",
    `ABI (${source.abi.length} entries):`,
    ...source.abi.map((s) => `  ${s}`),
    "",
    `Source files (${paths.length}):`,
    ...paths.map((p) => `  ${p} (${kb(source.files[p].length)})`),
    "",
    "Pass `file` with one of these paths to read its content.",
  );

  return truncate(lines.join("\n"), budget);
}
