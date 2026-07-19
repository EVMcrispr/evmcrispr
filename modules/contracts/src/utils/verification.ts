import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { bytesToHex, hexToBytes } from "viem";
import { loadCompiler } from "./solcLoader";

// ---------------------------------------------------------------------------
// Local verification: compile a Standard JSON Input with a pinned compiler
// and check the result against on-chain deployed bytecode. Used by `verify`
// for its dry-run path inside sim:fork, where submitting to Etherscan makes
// no sense (the contract only exists on the fork).
// ---------------------------------------------------------------------------

export interface ImmutableRange {
  start: number;
  length: number;
}

export interface SolcVerifyContractOutput {
  abi?: unknown[];
  evm?: {
    deployedBytecode?: {
      object?: string;
      immutableReferences?: Record<string, ImmutableRange[]>;
      linkReferences?: Record<string, Record<string, ImmutableRange[]>>;
    };
  };
}

export interface SolcStandardOutput {
  errors?: { severity: string; formattedMessage?: string; message: string }[];
  contracts?: Record<string, Record<string, SolcVerifyContractOutput>>;
}

/**
 * When a sim:fork block is running, return its active fork chain id
 * (`null` when unknown); `undefined` when no simulation is active. The sim
 * module instance is reachable through the shared module list and exposes
 * `mode`/`activeChainId` for the duration of the fork block.
 */
export function activeSimChainId(module: Module): number | null | undefined {
  const sim = module.context.modules.find((m) => m.name === "sim") as
    | (Module & { mode?: unknown; activeChainId?: number | null })
    | undefined;
  if (!sim || sim.mode == null) return undefined;
  return sim.activeChainId ?? null;
}

/**
 * Return a copy of a Standard JSON Input text with `outputSelection`
 * replaced so the compile yields deployed bytecode + immutable references
 * for every contract. Only the dry-run compiles this copy — the text
 * submitted to Etherscan stays untouched.
 */
export function withDeployedBytecodeSelection(
  standardJsonText: string,
): string {
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(standardJsonText);
  } catch {
    throw new ErrorException(
      "verify: --source is not valid JSON — expected Solidity Standard JSON Input",
    );
  }
  parsed.settings = {
    ...(parsed.settings ?? {}),
    outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode"] } },
  };
  return JSON.stringify(parsed);
}

/** Compile a Standard JSON Input text with a pinned long compiler version
 *  (bare, no `v` prefix). Throws on compiler errors. */
export async function compileStandardJson(
  standardJsonText: string,
  longVersion: string,
  log?: (message: string) => void,
): Promise<SolcStandardOutput> {
  const compile = await loadCompiler(longVersion, log);
  const output = JSON.parse(
    await compile(standardJsonText),
  ) as SolcStandardOutput;
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    const detail = errors
      .slice(0, 5)
      .map((e) => e.formattedMessage ?? e.message)
      .join("\n")
      .trim();
    throw new ErrorException(`verify: compilation failed:\n${detail}`);
  }
  return output;
}

export interface VerifyTarget {
  deployedBytecode: `0x${string}`;
  immutableReferences?: Record<string, ImmutableRange[]>;
  linkReferences?: Record<string, Record<string, ImmutableRange[]>>;
}

/**
 * Find the contract named by `contractName` in compiled output. Qualified
 * names (`path/File.sol:Contract` — split at the LAST colon, since source
 * unit names may be URLs) are looked up directly; a plain name is searched
 * across all source units and must be unique.
 */
export function selectVerifyTarget(
  output: SolcStandardOutput,
  contractName: string,
): VerifyTarget {
  const contracts = output.contracts ?? {};
  const sep = contractName.lastIndexOf(":");
  let entry: SolcVerifyContractOutput | undefined;
  let label = contractName;

  if (sep !== -1) {
    const file = contractName.slice(0, sep);
    const name = contractName.slice(sep + 1);
    entry = contracts[file]?.[name];
  } else {
    const matches: { file: string; out: SolcVerifyContractOutput }[] = [];
    for (const [file, byName] of Object.entries(contracts)) {
      if (contracts[file]?.[contractName]) {
        matches.push({ file, out: byName[contractName] });
      }
    }
    if (matches.length > 1) {
      throw new ErrorException(
        `verify: contract "${contractName}" is defined in several files: ${matches.map((m) => m.file).join(", ")} — use a qualified path/File.sol:Name`,
      );
    }
    entry = matches[0]?.out;
    if (matches[0]) label = `${matches[0].file}:${contractName}`;
  }

  const deployed = entry?.evm?.deployedBytecode;
  if (!entry || !deployed?.object) {
    throw new ErrorException(
      `verify: contract "${label}" not found in the compiled output (or it has no deployable bytecode)`,
    );
  }
  return {
    deployedBytecode: `0x${deployed.object}` as `0x${string}`,
    immutableReferences: deployed.immutableReferences,
    linkReferences: deployed.linkReferences,
  };
}

/**
 * Strip the trailing CBOR metadata blob solc appends to deployed bytecode.
 * The last 2 bytes are the big-endian payload length; the payload itself
 * starts with a CBOR map header (0xa0-0xbf). Returns the input unchanged
 * when no plausible metadata suffix is present (e.g. appendCBOR:false).
 */
export function stripCborMetadata(code: Uint8Array): Uint8Array {
  if (code.length < 2) return code;
  const payloadLength = (code[code.length - 2] << 8) | code[code.length - 1];
  const total = payloadLength + 2;
  if (payloadLength === 0 || total > code.length) return code;
  const header = code[code.length - total];
  if (header < 0xa0 || header > 0xbf) return code;
  return code.slice(0, code.length - total);
}

export interface MatchOptions {
  immutableReferences?: Record<string, ImmutableRange[]>;
  linkReferences?: Record<string, Record<string, ImmutableRange[]>>;
}

export interface MatchResult {
  match: boolean;
  reason?: string;
}

function maskRanges(bytes: Uint8Array, ranges: ImmutableRange[]): void {
  for (const { start, length } of ranges) {
    for (let i = start; i < start + length && i < bytes.length; i++) {
      bytes[i] = 0;
    }
  }
}

/**
 * Compare on-chain deployed bytecode against a compiled artifact the way a
 * verifier does: metadata suffixes stripped independently on each side
 * (they legitimately differ), immutable and library-link positions masked
 * (the artifact has zeros where the chain has constructor-set values).
 */
export function matchesDeployedBytecode(
  onchain: `0x${string}`,
  compiled: `0x${string}`,
  options: MatchOptions = {},
): MatchResult {
  const a = stripCborMetadata(hexToBytes(onchain));
  const b = stripCborMetadata(hexToBytes(compiled));
  if (a.length !== b.length) {
    return {
      match: false,
      reason: `code length mismatch (${a.length} vs ${b.length} bytes after metadata strip)`,
    };
  }

  const maskedA = new Uint8Array(a);
  const maskedB = new Uint8Array(b);
  for (const ranges of Object.values(options.immutableReferences ?? {})) {
    maskRanges(maskedA, ranges);
    maskRanges(maskedB, ranges);
  }
  for (const byLib of Object.values(options.linkReferences ?? {})) {
    for (const ranges of Object.values(byLib)) {
      maskRanges(maskedA, ranges);
      maskRanges(maskedB, ranges);
    }
  }

  for (let i = 0; i < maskedA.length; i++) {
    if (maskedA[i] !== maskedB[i]) {
      return {
        match: false,
        reason: `bytecode differs at offset 0x${i.toString(16)} (${bytesToHex(maskedA.slice(i, i + 4))} vs ${bytesToHex(maskedB.slice(i, i + 4))})`,
      };
    }
  }
  return { match: true };
}
