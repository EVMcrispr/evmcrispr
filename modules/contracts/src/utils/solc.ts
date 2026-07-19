import { ErrorException } from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";

// ---------------------------------------------------------------------------
// Pure helpers for the @solidity compile pipeline: option parsing, pragma
// version selection, standard-json construction and target-contract
// selection. Everything network-bound lives in solcLoader.ts.
// ---------------------------------------------------------------------------

/** Oldest release the vendored wrapper supports: `solidity_compile` with the
 *  (input, callbackPtr, contextPtr) signature is stable from 0.6.0 on. */
export const MIN_SOLC_VERSION = "0.6.0";

export interface CompileOptions {
  /** Explicit compiler release, e.g. "0.8.26". Overrides pragma detection. */
  version?: string;
  optimizerEnabled: boolean;
  optimizerRuns: number;
  viaIR: boolean;
  evmVersion?: string;
  /** Target contract name when the source defines several. */
  contract?: string;
}

export const DEFAULT_OPTIONS: CompileOptions = {
  optimizerEnabled: true,
  optimizerRuns: 200,
  viaIR: false,
};

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/**
 * Parse the trailing rest args of the @solidity helpers into a normalized
 * option set. Accepted forms: `version:0.8.26`, `runs:1000`,
 * `optimizer:off`, `via-ir`, `evm:cancun`, `contract:MyToken`.
 * Unknown options throw (typo protection).
 */
export function parseOptions(rest: string[]): CompileOptions {
  const opts: CompileOptions = { ...DEFAULT_OPTIONS };
  for (const raw of rest) {
    const arg = String(raw).trim();
    if (arg === "via-ir") {
      opts.viaIR = true;
      continue;
    }
    if (arg === "optimizer:off") {
      opts.optimizerEnabled = false;
      continue;
    }
    const sep = arg.indexOf(":");
    const key = sep === -1 ? arg : arg.slice(0, sep);
    const value = sep === -1 ? "" : arg.slice(sep + 1);
    switch (key) {
      case "version":
        if (!VERSION_RE.test(value)) {
          throw new ErrorException(
            `@solidity: invalid version "${value}" — expected e.g. version:0.8.26`,
          );
        }
        opts.version = value;
        break;
      case "runs": {
        const runs = Number(value);
        if (!Number.isInteger(runs) || runs < 0) {
          throw new ErrorException(
            `@solidity: invalid runs "${value}" — expected e.g. runs:1000`,
          );
        }
        opts.optimizerEnabled = true;
        opts.optimizerRuns = runs;
        break;
      }
      case "evm":
        if (!value) {
          throw new ErrorException(
            "@solidity: evm option requires a value, e.g. evm:cancun",
          );
        }
        opts.evmVersion = value;
        break;
      case "contract":
        if (!value) {
          throw new ErrorException(
            "@solidity: contract option requires a name, e.g. contract:MyToken",
          );
        }
        opts.contract = value;
        break;
      default:
        throw new ErrorException(
          `@solidity: unknown option "${arg}" — supported: version:<x.y.z>, runs:<n>, optimizer:off, via-ir, evm:<version>, contract:<Name>`,
        );
    }
  }
  return opts;
}

/** Extract the version constraint of the first `pragma solidity` directive. */
export function parsePragma(source: string): string | undefined {
  const m = source.match(/pragma\s+solidity\s+([^;]+);/);
  return m ? m[1].trim() : undefined;
}

type Semver = [number, number, number];

function parseSemver(v: string): Semver | undefined {
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

function cmp(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

interface Comparator {
  op: "=" | "^" | ">" | ">=" | "<" | "<=";
  v: Semver;
}

function parseConstraint(constraint: string): Comparator[] {
  const parts = constraint.split(/\s+/).filter(Boolean);
  const comparators: Comparator[] = [];
  for (const part of parts) {
    const m = part.match(/^(\^|>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+)$/);
    if (!m) {
      throw new ErrorException(
        `@solidity: unsupported pragma/version constraint "${constraint}" — pin one with version:<x.y.z>`,
      );
    }
    const v = parseSemver(m[2]);
    if (!v) {
      throw new ErrorException(
        `@solidity: unsupported version "${part}" in constraint "${constraint}"`,
      );
    }
    comparators.push({ op: (m[1] as Comparator["op"]) ?? "=", v });
  }
  return comparators;
}

function satisfies(v: Semver, c: Comparator): boolean {
  const d = cmp(v, c.v);
  switch (c.op) {
    case "=":
      return d === 0;
    case ">":
      return d > 0;
    case ">=":
      return d >= 0;
    case "<":
      return d < 0;
    case "<=":
      return d <= 0;
    case "^": {
      if (d < 0) return false;
      // ^0.y.z pins the minor; ^x.y.z (x>0) pins the major.
      if (c.v[0] === 0) return v[0] === 0 && v[1] === c.v[1];
      return v[0] === c.v[0];
    }
  }
}

/**
 * Pick the newest release from `releases` (list.json `releases` keys, e.g.
 * "0.8.26") satisfying `constraint` (a pragma expression or an exact pin).
 * Releases older than MIN_SOLC_VERSION are never selected.
 */
export function selectVersion(constraint: string, releases: string[]): string {
  const comparators = parseConstraint(constraint);
  const min = parseSemver(MIN_SOLC_VERSION) as Semver;
  const candidates = releases
    .map((r) => ({ r, v: parseSemver(r) }))
    .filter((x): x is { r: string; v: Semver } => x.v !== undefined)
    .filter((x) => cmp(x.v, min) >= 0)
    .filter((x) => comparators.every((c) => satisfies(x.v, c)))
    .sort((a, b) => cmp(b.v, a.v));
  if (!candidates.length) {
    throw new ErrorException(
      `@solidity: no solc release ≥ ${MIN_SOLC_VERSION} satisfies "${constraint}"`,
    );
  }
  return candidates[0].r;
}

/** Build the solc standard-json input for a set of prefetched sources. */
export function buildStandardJson(
  sources: Record<string, string>,
  opts: CompileOptions,
): string {
  const settings: Record<string, unknown> = {
    optimizer: { enabled: opts.optimizerEnabled, runs: opts.optimizerRuns },
    outputSelection: { "*": { "*": ["evm.bytecode.object", "abi"] } },
  };
  if (opts.viaIR) settings.viaIR = true;
  if (opts.evmVersion) settings.evmVersion = opts.evmVersion;
  return JSON.stringify({
    language: "Solidity",
    sources: Object.fromEntries(
      Object.entries(sources).map(([name, content]) => [name, { content }]),
    ),
    settings,
  });
}

export interface SelectedContract {
  /** Qualified name, e.g. `Token.sol:Token`. */
  qualifiedName: string;
  /** Creation bytecode, 0x-prefixed. */
  bytecode: `0x${string}`;
  abi: unknown[];
}

interface SolcContractOutput {
  abi: unknown[];
  evm?: { bytecode?: { object?: string } };
}

/**
 * Pick the target contract from solc output. Preference order:
 * explicit `contract:` option → single deployable contract in the root
 * source unit → root file-stem match → single deployable contract overall.
 */
export function selectContract(
  contracts: Record<string, Record<string, SolcContractOutput>>,
  rootSourceName: string,
  contractHint: string | undefined,
): SelectedContract {
  interface Candidate {
    file: string;
    name: string;
    out: SolcContractOutput;
  }
  const all: Candidate[] = [];
  for (const [file, byName] of Object.entries(contracts ?? {})) {
    for (const [name, out] of Object.entries(byName)) {
      all.push({ file, name, out });
    }
  }

  const deployable = all.filter(
    (c) => (c.out.evm?.bytecode?.object ?? "") !== "",
  );

  let picked: Candidate | undefined;
  if (contractHint) {
    const matches = all.filter((c) => c.name === contractHint);
    if (!matches.length) {
      throw new ErrorException(
        `@solidity: contract "${contractHint}" not found — defined contracts: ${all.map((c) => c.name).join(", ") || "none"}`,
      );
    }
    if (matches.length > 1) {
      throw new ErrorException(
        `@solidity: contract "${contractHint}" is defined in several files: ${matches.map((c) => c.file).join(", ")}`,
      );
    }
    picked = matches[0];
    if ((picked.out.evm?.bytecode?.object ?? "") === "") {
      throw new ErrorException(
        `@solidity: contract "${contractHint}" has no deployable bytecode (abstract contract or interface)`,
      );
    }
  } else {
    const inRoot = deployable.filter((c) => c.file === rootSourceName);
    if (inRoot.length === 1) {
      picked = inRoot[0];
    } else {
      const stem = rootSourceName
        .split("/")
        .pop()
        ?.replace(/\.sol$/, "");
      const pool = inRoot.length ? inRoot : deployable;
      const stemMatch = pool.filter((c) => c.name === stem);
      if (stemMatch.length === 1) {
        picked = stemMatch[0];
      } else if (deployable.length === 1) {
        picked = deployable[0];
      }
    }
  }

  if (!picked) {
    const names = deployable.map((c) => c.name);
    throw new ErrorException(
      names.length
        ? `@solidity: several deployable contracts found (${names.join(", ")}) — pick one with contract:<Name>`
        : "@solidity: no deployable contract found in the source",
    );
  }

  return {
    qualifiedName: `${picked.file}:${picked.name}`,
    bytecode: `0x${picked.out.evm?.bytecode?.object}` as `0x${string}`,
    abi: picked.out.abi ?? [],
  };
}

/** Stable cache key for a (source, options) compile request. */
export function compileCacheKey(source: string, opts: CompileOptions): string {
  const normalized = JSON.stringify({
    version: opts.version ?? null,
    optimizerEnabled: opts.optimizerEnabled,
    optimizerRuns: opts.optimizerRuns,
    viaIR: opts.viaIR,
    evmVersion: opts.evmVersion ?? null,
    contract: opts.contract ?? null,
  });
  return keccak256(toHex(`${source}\0${normalized}`));
}
