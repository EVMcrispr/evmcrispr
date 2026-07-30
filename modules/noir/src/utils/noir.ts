/**
 * In-memory Noir compilation for `@noir:*` and `noir:prove --noir`.
 *
 * The compiler is @noir-lang/noir_wasm, driven through its virtual file
 * manager: a synthesized single-package project (`Nargo.toml` +
 * `src/main.nr`) is written per compile, so scripts provide bare Noir
 * source with the stdlib available and no Nargo project on disk. External
 * Nargo dependencies are git-based and cannot be fetched verifiably
 * in-browser, so they are not supported — single-file circuits only.
 * Compiled artifacts are cached per source for the session; the cache key
 * doubles as the vkey/verifier cache prefix (utils/barretenberg.ts).
 *
 * All wasm in the Noir/Barretenberg stack ships inside the npm packages
 * themselves (data-URI or package-relative assets), so integrity comes
 * from the lockfile at bundle time — there is nothing to fetch or pin at
 * runtime. The version constants below are unit-tested against the
 * installed packages so they can't drift silently.
 */
import { ErrorException, type FetchContext } from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";

export type { FetchContext };

/** Keep in sync with the @noir-lang/* dependencies in package.json (unit-tested). */
export const NOIR_VERSION = "1.0.0-beta.26";
/** Keep in sync with the @aztec/bb.js dependency in package.json (unit-tested). */
export const BB_VERSION = "5.1.0";

/**
 * Compiled Noir program artifact — the nargo `target/*.json` shape with
 * the debug payload (`debug_symbols`, `file_map`) stripped, since bound
 * values travel through script bindings and IPFS shares.
 */
export interface NoirProgramArtifact {
  noir_version: string;
  hash?: string;
  /** ABI of main() — noirc_abi encodes inputs against this. */
  abi: Record<string, unknown>;
  /** ACIR bytecode, base64. */
  bytecode: string;
}

export interface CompileNoirResult {
  program: NoirProgramArtifact;
  /** The artifact as a JSON string (what `@noir:compile` returns). */
  artifactJson: string;
  /** Cache key — also the prefix of the vkey/verifier cache keys. */
  compileKey: string;
}

function isUrl(s: string): boolean {
  return /^(https?|ipfs):\/\//.test(s);
}

async function fetchSource(
  sourceName: string,
  ctx: FetchContext,
): Promise<string> {
  if (sourceName.startsWith("ipfs://")) {
    if (!ctx.fetchIpfs) {
      throw new ErrorException(
        `@noir:compile: no IPFS resolver available for ${sourceName}`,
      );
    }
    try {
      const bytes = await ctx.fetchIpfs(sourceName.replace(/^ipfs:\/\//, ""));
      return new TextDecoder().decode(bytes);
    } catch (err) {
      throw new ErrorException(
        `@noir:compile: fetching ${sourceName}: ${(err as Error).message ?? err}`,
      );
    }
  }
  let res: Response;
  try {
    res = await fetch(sourceName);
  } catch (err) {
    throw new ErrorException(
      `@noir:compile: network error fetching ${sourceName}: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `@noir:compile: ${res.status} ${res.statusText} fetching ${sourceName}`,
    );
  }
  return res.text();
}

type NoirWasm = typeof import("@noir-lang/noir_wasm");

let noirWasmPromise: Promise<NoirWasm> | undefined;

/** Load the Noir compiler on first use — it must never load with the module. */
function loadNoirWasm(): Promise<NoirWasm> {
  if (!noirWasmPromise) {
    noirWasmPromise = import("@noir-lang/noir_wasm") as Promise<NoirWasm>;
    noirWasmPromise.catch(() => {
      noirWasmPromise = undefined;
    });
  }
  return noirWasmPromise;
}

const NARGO_TOML = `[package]\nname = "main"\ntype = "bin"\n`;

async function textStream(text: string): Promise<ReadableStream<Uint8Array>> {
  return new Blob([text]).stream() as ReadableStream<Uint8Array>;
}

/**
 * Nargo `[dependencies]` are git-fetched by nargo itself; the in-browser
 * compiler cannot fetch them, so fail with a useful message instead of a
 * "dependency not found" from deep inside the compiler.
 */
const DEP_USE_RE = /^\s*use\s+dep::/m;

async function compileNoirFresh(
  sourceArg: string,
  compileKey: string,
  ctx: FetchContext,
): Promise<CompileNoirResult> {
  const source = isUrl(sourceArg)
    ? await fetchSource(sourceArg, ctx)
    : sourceArg;
  if (DEP_USE_RE.test(source)) {
    throw new ErrorException(
      "@noir:compile: external Nargo dependencies (use dep::…) are not supported — inline the code or use the stdlib (std::…)",
    );
  }
  const { compile_program, createFileManager } = await loadNoirWasm();
  const isNode = typeof process !== "undefined" && !!process.versions?.node;
  let dataDir = "/";
  if (isNode) {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    dataDir = await mkdtemp(join(tmpdir(), "evmcrispr-noir-"));
  }
  const fm = createFileManager(dataDir);
  await fm.writeFile("./Nargo.toml", await textStream(NARGO_TOML));
  await fm.writeFile("./src/main.nr", await textStream(source));
  ctx.log?.("@noir:compile: compiling…");
  let artifacts: Awaited<ReturnType<typeof compile_program>>;
  try {
    artifacts = await compile_program(
      fm,
      undefined,
      () => {},
      () => {},
    );
  } catch (err) {
    throw new ErrorException(
      `@noir:compile: compilation failed:\n${formatCompileError(err)}`,
    );
  }
  const {
    debug_symbols: _debug,
    file_map: _files,
    ...program
  } = artifacts.program;
  return {
    program: program as unknown as NoirProgramArtifact,
    artifactJson: JSON.stringify(program),
    compileKey,
  };
}

function formatCompileError(err: unknown): string {
  const diagnostics = (err as { diagnostics?: unknown[] }).diagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length) {
    return diagnostics
      .slice(0, 20)
      .map((d) =>
        typeof d === "string"
          ? d
          : ((d as { message?: string }).message ?? JSON.stringify(d)),
      )
      .join("\n");
  }
  return (err as Error).message ?? String(err);
}

/** Parse a pre-built program artifact JSON (nargo `target/*.json`). */
export function parseArtifactJson(
  json: string,
  what: string,
): NoirProgramArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ErrorException(`${what} is not valid JSON`);
  }
  const artifact = parsed as NoirProgramArtifact;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof artifact.bytecode !== "string" ||
    artifact.abi === null ||
    typeof artifact.abi !== "object"
  ) {
    throw new ErrorException(
      `${what} is not a compiled Noir program artifact (expected nargo target/*.json with bytecode and abi)`,
    );
  }
  return artifact;
}

// --- cache ---

const compileCache = new Map<string, Promise<CompileNoirResult>>();

export function compileNoirCached(
  sourceArg: string,
  ctx: FetchContext,
): Promise<CompileNoirResult> {
  const compileKey = keccak256(toHex(`${sourceArg}\0{}`));
  let cached = compileCache.get(compileKey);
  if (!cached) {
    cached = compileNoirFresh(sourceArg, compileKey, ctx);
    compileCache.set(compileKey, cached);
    cached.catch(() => compileCache.delete(compileKey));
  }
  return cached;
}

/**
 * Cache key for a pre-built artifact (no compile step) — keyed by content
 * so vkey/verifier caches work for `--artifact` runs too.
 */
export function artifactCompileKey(artifactJson: string): string {
  return keccak256(toHex(`artifact\0${artifactJson}`));
}
