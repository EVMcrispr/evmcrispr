import {
  ErrorException,
  fetchNpmLatestVersion,
  fetchVerifiedNpmFile,
  parseNpmFileSpec,
  parseNpmPackageName,
} from "@evmcrispr/sdk";
import type { CompileOptions } from "./solc";
import {
  buildStandardJson,
  compileCacheKey,
  parseOptions,
  parsePragma,
  selectContract,
  selectVersion,
} from "./solc";
import { SOLC_SHA256 } from "./solcHashes";

// ---------------------------------------------------------------------------
// Network + compiler plumbing for @solidity: release-list fetch, lazy
// soljson download/instantiation (browser + bun via a CJS shim, verified
// against repo-pinned hashes), transitive import prefetching (URL, relative
// and version-pinned npm-style from registry-verified tarballs) and the
// shared compile cache the four @solidity helpers read from.
// ---------------------------------------------------------------------------

const BINARIES_BASE = "https://binaries.soliditylang.org/bin";

export interface CompileResult {
  /** Creation bytecode of the selected contract, 0x-prefixed. */
  bytecode: `0x${string}`;
  /** The exact standard-json input text that was compiled. */
  standardJson: string;
  /** Qualified contract name, e.g. `Token.sol:Token`. */
  qualifiedName: string;
  /** Long compiler version, e.g. `0.8.26+commit.8a97fa7a`. */
  compilerLongVersion: string;
  abi: unknown[];
}

export interface CompileContext {
  log?: (message: string) => void;
  /** Fetch an IPFS cid (or cid/path) as text, hash-verified against the CID. */
  fetchIpfs?: (cidPath: string) => Promise<string>;
}

type CompileFn = (inputJson: string) => Promise<string>;

interface ReleaseList {
  /** version → long version, e.g. "0.8.26" → "0.8.26+commit.8a97fa7a" */
  releases: Record<string, string>;
}

async function fetchText(url: string, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ErrorException(
      `@solidity: network error fetching ${what} (${url})`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `@solidity: ${res.status} ${res.statusText} fetching ${what} (${url})`,
    );
  }
  return res;
}

let releaseListPromise: Promise<ReleaseList> | undefined;

/** Fetch (once per session) the solc release list from binaries.soliditylang.org. */
export function fetchReleaseList(): Promise<ReleaseList> {
  releaseListPromise ??= (async () => {
    const res = await fetchText(
      `${BINARIES_BASE}/list.json`,
      "the solc release list",
    );
    const raw = (await res.json()) as { releases: Record<string, string> };
    const releases: Record<string, string> = {};
    for (const [version, file] of Object.entries(raw.releases)) {
      // "soljson-v0.8.26+commit.8a97fa7a.js" → "0.8.26+commit.8a97fa7a"
      const m = file.match(/^soljson-v(.+)\.js$/);
      if (m) releases[version] = m[1];
    }
    return { releases };
  })();
  return releaseListPromise;
}

const compilerCache = new Map<string, Promise<CompileFn>>();

/**
 * Instantiate soljson in-process through a CJS shim. Used under Node/bun,
 * where the emscripten wrapper takes its Node path and expects `require`
 * and `__dirname`.
 */
async function instantiateInProcess(src: string): Promise<CompileFn> {
  const mod = { exports: {} as any };
  const { createRequire } = await import(/* @vite-ignore */ "node:module");
  new Function("module", "exports", "require", "__dirname", src)(
    mod,
    mod.exports,
    createRequire(import.meta.url),
    "/",
  );
  const compile = mod.exports.cwrap("solidity_compile", "string", [
    "string",
    "number",
    "number",
  ]) as (input: string, cbPtr: number, ctxPtr: number) => string;
  return async (inputJson) => compile(inputJson, 0, 0);
}

/**
 * Instantiate soljson inside an inline Blob worker. Browsers refuse the
 * synchronous >8 MB WebAssembly compile soljson performs on the main
 * thread, and compiling there would freeze the UI anyway. The worker is
 * kept alive per compiler version (instantiation is the expensive part).
 */
function instantiateInWorker(src: string): Promise<CompileFn> {
  const workerSource = `
    let compile = null;
    self.onmessage = (e) => {
      const msg = e.data;
      try {
        if (msg.type === "init") {
          // Indirect eval runs at global scope, so the script's top-level
          // "var Module" becomes a worker global. solc's emscripten build
          // instantiates synchronously (allowed in workers at any size),
          // so Module is ready as soon as eval returns.
          (0, eval)(msg.soljson);
          compile = self.Module.cwrap("solidity_compile", "string", ["string", "number", "number"]);
          self.postMessage({ id: msg.id, ok: true });
        } else {
          self.postMessage({ id: msg.id, ok: true, out: compile(msg.input, 0, 0) });
        }
      } catch (err) {
        self.postMessage({ id: msg.id, ok: false, error: String(err) });
      }
    };`;
  const url = URL.createObjectURL(
    new Blob([workerSource], { type: "text/javascript" }),
  );
  const worker = new Worker(url);
  URL.revokeObjectURL(url);

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (out: string | undefined) => void; reject: (e: Error) => void }
  >();
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, out, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(out);
    else p.reject(new ErrorException(`@solidity: ${error}`));
  };
  const post = (msg: Record<string, unknown>): Promise<string | undefined> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id });
    });

  return post({ type: "init", soljson: src }).then(
    () => (inputJson: string) =>
      post({ type: "compile", input: inputJson }) as Promise<string>,
  );
}

/** Download and instantiate a soljson build (memoized per version). */
export function loadCompiler(
  longVersion: string,
  log?: (message: string) => void,
): Promise<CompileFn> {
  let cached = compilerCache.get(longVersion);
  if (!cached) {
    cached = (async () => {
      const expected = SOLC_SHA256[longVersion];
      if (!expected) {
        throw new ErrorException(
          `@solidity: solc v${longVersion} has no repo-pinned hash — regenerate it (bun modules/contracts/scripts/generate-solc-hashes.ts) or pin an older release`,
        );
      }
      log?.(
        `@solidity: downloading solc v${longVersion} (~9 MB, first use only)…`,
      );
      const res = await fetchText(
        `${BINARIES_BASE}/soljson-v${longVersion}.js`,
        `solc v${longVersion}`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer),
      );
      const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
      if (hex !== expected) {
        throw new ErrorException(
          `@solidity: the downloaded solc v${longVersion} does not match its pinned hash (got ${hex}, expected ${expected})`,
        );
      }
      const src = new TextDecoder().decode(bytes);

      const isNode = typeof process !== "undefined" && !!process.versions?.node;
      const compile = isNode
        ? await instantiateInProcess(src)
        : await instantiateInWorker(src);
      log?.(`@solidity: solc v${longVersion} ready`);
      return compile;
    })();
    compilerCache.set(longVersion, cached);
    cached.catch(() => compilerCache.delete(longVersion));
  }
  return cached;
}

const IMPORT_RE = /import\s+[^;]*?["']([^"']+)["']/g;

function isUrl(s: string): boolean {
  return /^(https?|ipfs):\/\//.test(s);
}

/** Normalize `.`/`..` segments of a slash-separated path. */
function normalizeSegments(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) {
        throw new ErrorException(
          `@solidity: import path escapes its package root: ${path}`,
        );
      }
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/** Resolve an import path against the source unit name of its importer. */
function resolveImport(importPath: string, importer: string): string {
  if (isUrl(importPath)) return importPath;
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    if (isUrl(importer)) {
      return new URL(importPath, importer).href;
    }
    const dir = importer.includes("/")
      ? importer.slice(0, importer.lastIndexOf("/"))
      : "";
    if (!dir && !importer.includes("/")) {
      throw new ErrorException(
        `@solidity: relative import "${importPath}" is not supported in inline source — flatten the contract, host it at a URL, or use version-pinned npm imports (@scope/pkg@x.y.z/File.sol)`,
      );
    }
    return normalizeSegments(`${dir}/${importPath}`);
  }
  // npm-style: @scope/pkg/path/File.sol or pkg/path/File.sol
  return normalizeSegments(importPath);
}

async function fetchSource(
  sourceName: string,
  what: string,
  ctx: CompileContext,
): Promise<string> {
  if (sourceName.startsWith("ipfs://")) {
    if (!ctx.fetchIpfs) {
      throw new ErrorException(
        `@solidity: no IPFS resolver available for ${sourceName}`,
      );
    }
    try {
      return await ctx.fetchIpfs(sourceName.replace(/^ipfs:\/\//, ""));
    } catch (err) {
      throw new ErrorException(
        `@solidity: fetching ${what} (${sourceName}): ${(err as Error).message ?? err}`,
      );
    }
  }
  if (isUrl(sourceName)) {
    const res = await fetchText(sourceName, what);
    return res.text();
  }
  // npm-style import: an exact version pin makes the content immutable, so
  // it can be fetched as a registry-verified tarball.
  const spec = parseNpmFileSpec(sourceName);
  if (!spec) {
    const pkg = parseNpmPackageName(sourceName) ?? "@scope/pkg";
    const latest = await fetchNpmLatestVersion(pkg).catch(() => undefined);
    throw new ErrorException(
      `@solidity: import "${sourceName}" must pin an exact package version, e.g. ${pkg}@${latest ?? "x.y.z"}/… — unpinned npm content cannot be verified`,
    );
  }
  try {
    return new TextDecoder().decode(await fetchVerifiedNpmFile(spec));
  } catch (err) {
    throw new ErrorException(
      `@solidity: fetching ${what} (${sourceName}): ${(err as Error).message ?? err}`,
    );
  }
}

/** Source unit name used for inline (non-URL) root sources. */
export const INLINE_ROOT_NAME = "input.sol";

/**
 * Prefetch the transitive import closure of a root source. Sources are
 * keyed by source unit name: full URLs for URL-hosted files, npm-style
 * paths (fetched from unpkg) for bare imports, `input.sol` for the inline
 * root. Since every source is prefetched, solc needs no import callback.
 */
export async function crawlImports(
  rootSource: string,
  rootName: string,
  ctx: CompileContext,
): Promise<Record<string, string>> {
  const sources: Record<string, string> = { [rootName]: rootSource };
  const queue: string[] = [rootName];
  const MAX_SOURCES = 200;

  while (queue.length) {
    const importer = queue.shift() as string;
    const content = sources[importer];
    for (const m of content.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(m[1], importer);
      if (sources[resolved] !== undefined) continue;
      if (Object.keys(sources).length >= MAX_SOURCES) {
        throw new ErrorException(
          `@solidity: import graph exceeds ${MAX_SOURCES} files`,
        );
      }
      ctx.log?.(`@solidity: fetching ${resolved}…`);
      sources[resolved] = await fetchSource(resolved, resolved, ctx);
      queue.push(resolved);
    }
  }
  return sources;
}

const compileCache = new Map<string, Promise<CompileResult>>();

interface SolcError {
  severity: string;
  formattedMessage?: string;
  message: string;
}

async function compileFresh(
  sourceArg: string,
  opts: CompileOptions,
  ctx: CompileContext,
): Promise<CompileResult> {
  // 1. Root source: URL vs inline.
  let rootSource: string;
  let rootName: string;
  if (isUrl(sourceArg)) {
    rootName = sourceArg;
    rootSource = await fetchSource(sourceArg, "the Solidity source", ctx);
  } else {
    rootName = INLINE_ROOT_NAME;
    rootSource = sourceArg;
  }

  // 2. Import closure.
  const sources = await crawlImports(rootSource, rootName, ctx);

  // 3. Compiler version.
  const { releases } = await fetchReleaseList();
  let version: string;
  if (opts.version) {
    if (!releases[opts.version]) {
      throw new ErrorException(
        `@solidity: unknown solc release "${opts.version}"`,
      );
    }
    version = opts.version;
  } else {
    const pragma = parsePragma(rootSource);
    if (!pragma) {
      throw new ErrorException(
        "@solidity: no `pragma solidity` found — pin a compiler with version:<x.y.z>",
      );
    }
    version = selectVersion(pragma, Object.keys(releases));
  }
  const longVersion = releases[version];

  // 4. Compile.
  const standardJson = buildStandardJson(sources, opts);
  const compile = await loadCompiler(longVersion, ctx.log);
  ctx.log?.(`@solidity: compiling with solc v${version}…`);
  const output = JSON.parse(await compile(standardJson)) as {
    errors?: SolcError[];
    contracts?: Record<string, Record<string, any>>;
  };

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    const detail = errors
      .slice(0, 5)
      .map((e) => e.formattedMessage ?? e.message)
      .join("\n")
      .trim();
    throw new ErrorException(`@solidity: compilation failed:\n${detail}`);
  }

  // 5. Target contract.
  const selected = selectContract(
    output.contracts ?? {},
    rootName,
    opts.contract,
  );

  return {
    bytecode: selected.bytecode,
    standardJson,
    qualifiedName: selected.qualifiedName,
    compilerLongVersion: longVersion,
    abi: selected.abi,
  };
}

/**
 * Compile a source (inline text or URL) with the given helper rest-args,
 * memoized per (source, options) so the @solidity companions reuse one
 * compile across a deploy + verify script.
 */
export function compileCached(
  sourceArg: string,
  restOptions: string[],
  ctx: CompileContext,
): Promise<CompileResult> {
  const opts = parseOptions(restOptions.map(String));
  const key = compileCacheKey(sourceArg, opts);
  let cached = compileCache.get(key);
  if (!cached) {
    cached = compileFresh(sourceArg, opts, ctx);
    compileCache.set(key, cached);
    cached.catch(() => compileCache.delete(key));
  }
  return cached;
}
