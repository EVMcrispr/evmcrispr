/**
 * In-memory circom compilation for `@circom:*` and `circom:prove --circom`.
 *
 * The compiler is circom2 (the circom 2.x WASI build used by zkREPL),
 * executed over an in-memory wasmfs volume: the include closure is
 * prefetched up front (mirroring the @contracts:solidity import crawler —
 * URL includes as written, version-pinned `circomlib@x.y.z/...` npm paths
 * from registry-verified tarballs), every source unit is written to a flat
 * virtual path and include
 * statements are rewritten to those paths, so circom needs no search-path
 * (-l) configuration and URL-keyed unit names never have to be valid
 * filesystem paths. Compiled artifacts are cached per source for the
 * session; the cache key doubles as the setup-cache prefix (utils/setup.ts).
 */
import {
  ErrorException,
  fetchNpmLatestVersion,
  fetchVerifiedNpmFile,
  parseNpmFileSpec,
  parseNpmPackageName,
} from "@evmcrispr/sdk";
import { keccak256, toHex } from "viem";
import type { FetchContext } from "./snarkjs";

/** Keep in sync with the circom2 dependency in package.json (unit-tested). */
export const CIRCOM2_VERSION = "0.2.23";
/**
 * Repo-pinned sha256 of circom2's circom.wasm — the browser download is
 * checked against this on top of the registry integrity check, since the
 * wasm is executed. Unit-tested against the lockfile-verified node_modules
 * copy, so it can't drift from CIRCOM2_VERSION.
 */
export const CIRCOM_WASM_SHA256 =
  "0x96fc92a93768f38979db6c2bac4b1aa9fc7d66742121a63d4c4792d5b4037162";

const INCLUDE_RE = /include\s+"([^"]+)"\s*;?/g;
const MAX_SOURCES = 200;

/** Source unit name used for inline (non-URL) root sources. */
export const INLINE_ROOT_NAME = "main.circom";

export interface CompileCircomResult {
  /** Witness-generator wasm (feeds groth16FullProve). */
  wasm: Uint8Array;
  /** Constraint system (feeds zKey.newZKey as a mem fastfile). */
  r1cs: Uint8Array;
  constraints: number;
  /** Cache key — also the prefix of the setup cache key. */
  compileKey: string;
}

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
          `@circom:circom: include path escapes its package root: ${path}`,
        );
      }
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/** Resolve an include path against the source unit name of its includer. */
export function resolveInclude(includePath: string, includer: string): string {
  if (isUrl(includePath)) return includePath;
  if (includePath.startsWith("./") || includePath.startsWith("../")) {
    if (isUrl(includer)) {
      return new URL(includePath, includer).href;
    }
    const dir = includer.includes("/")
      ? includer.slice(0, includer.lastIndexOf("/"))
      : "";
    if (!dir && !includer.includes("/")) {
      throw new ErrorException(
        `@circom:circom: relative include "${includePath}" is not supported in inline source — host the circuit at a URL or include a version-pinned npm path (circomlib@x.y.z/circuits/...)`,
      );
    }
    return normalizeSegments(`${dir}/${includePath}`);
  }
  // npm-style: circomlib/circuits/poseidon.circom
  return normalizeSegments(includePath);
}

async function fetchSource(
  sourceName: string,
  ctx: FetchContext,
): Promise<string> {
  if (sourceName.startsWith("ipfs://")) {
    if (!ctx.fetchIpfs) {
      throw new ErrorException(
        `@circom:circom: no IPFS resolver available for ${sourceName}`,
      );
    }
    try {
      const bytes = await ctx.fetchIpfs(sourceName.replace(/^ipfs:\/\//, ""));
      return new TextDecoder().decode(bytes);
    } catch (err) {
      throw new ErrorException(
        `@circom:circom: fetching ${sourceName}: ${(err as Error).message ?? err}`,
      );
    }
  }
  if (isUrl(sourceName)) {
    let res: Response;
    try {
      res = await fetch(sourceName);
    } catch (err) {
      throw new ErrorException(
        `@circom:circom: network error fetching ${sourceName}: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new ErrorException(
        `@circom:circom: ${res.status} ${res.statusText} fetching ${sourceName}`,
      );
    }
    return res.text();
  }
  // npm-style include: an exact version pin makes the content immutable, so
  // it can be fetched as a registry-verified tarball.
  const spec = parseNpmFileSpec(sourceName);
  if (!spec) {
    const pkg = parseNpmPackageName(sourceName) ?? "circomlib";
    const latest = await fetchNpmLatestVersion(pkg).catch(() => undefined);
    throw new ErrorException(
      `@circom:circom: include "${sourceName}" must pin an exact package version, e.g. ${pkg}@${latest ?? "x.y.z"}/… — unpinned npm content cannot be verified`,
    );
  }
  try {
    return new TextDecoder().decode(await fetchVerifiedNpmFile(spec));
  } catch (err) {
    throw new ErrorException(
      `@circom:circom: fetching ${sourceName}: ${(err as Error).message ?? err}`,
    );
  }
}

/**
 * Prefetch the transitive include closure of a root source. Sources are
 * keyed by source unit name: full URLs for URL-hosted files, npm-style
 * paths (fetched from unpkg) for bare includes, `main.circom` for the
 * inline root.
 */
export async function crawlIncludes(
  rootSource: string,
  rootName: string,
  ctx: FetchContext,
): Promise<Record<string, string>> {
  const sources: Record<string, string> = { [rootName]: rootSource };
  const queue: string[] = [rootName];

  while (queue.length) {
    const includer = queue.shift() as string;
    for (const m of sources[includer].matchAll(INCLUDE_RE)) {
      const resolved = resolveInclude(m[1], includer);
      if (sources[resolved] !== undefined) continue;
      if (Object.keys(sources).length >= MAX_SOURCES) {
        throw new ErrorException(
          `@circom:circom: include graph exceeds ${MAX_SOURCES} files`,
        );
      }
      ctx.log?.(`@circom:circom: fetching ${resolved}…`);
      sources[resolved] = await fetchSource(resolved, ctx);
      queue.push(resolved);
    }
  }
  return sources;
}

/**
 * Assign each source unit a flat virtual path (`/main.circom` for the
 * root, `/dep_<i>.circom` in insertion order otherwise) and rewrite every
 * include statement to its target's virtual path.
 */
export function virtualizeSources(
  sources: Record<string, string>,
  rootName: string,
): Record<string, string> {
  const paths = new Map<string, string>();
  let i = 0;
  for (const name of Object.keys(sources)) {
    paths.set(name, name === rootName ? "/main.circom" : `/dep_${i++}.circom`);
  }
  const virtualized: Record<string, string> = {};
  for (const [name, content] of Object.entries(sources)) {
    virtualized[paths.get(name) as string] = content.replace(
      INCLUDE_RE,
      (statement, includePath: string) => {
        const target = paths.get(resolveInclude(includePath, name));
        return target ? statement.replace(includePath, target) : statement;
      },
    );
  }
  return virtualized;
}

// --- compiler ---

let circomWasmPromise: Promise<Uint8Array> | undefined;

/** Acquire the ~9 MB circom compiler wasm once per session. */
function loadCircomWasm(ctx: FetchContext): Promise<Uint8Array> {
  if (!circomWasmPromise) {
    circomWasmPromise = loadCircomWasmFresh(ctx);
    circomWasmPromise.catch(() => {
      circomWasmPromise = undefined;
    });
  }
  return circomWasmPromise;
}

async function loadCircomWasmFresh(ctx: FetchContext): Promise<Uint8Array> {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(
      await readFile(new URL(import.meta.resolve("circom2/circom.wasm"))),
    );
  }
  ctx.log?.(
    "@circom:circom: downloading the circom compiler (~9 MB, first use only)…",
  );
  const wasm = await fetchVerifiedNpmFile({
    name: "circom2",
    version: CIRCOM2_VERSION,
    path: "circom.wasm",
  });
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", wasm as unknown as ArrayBuffer),
  );
  const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (hex !== CIRCOM_WASM_SHA256) {
    throw new ErrorException(
      `@circom:circom: the downloaded circom compiler does not match its pinned hash (got ${hex})`,
    );
  }
  return wasm;
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

async function runCircom(
  virtualSources: Record<string, string>,
  ctx: FetchContext,
): Promise<{ wasm: Uint8Array; r1cs: Uint8Array }> {
  // @wasmer/wasi's "buffer polyfill" just re-exports the global Buffer, so
  // circom2 throws in contexts without one (web workers; pages only work
  // when a wallet lib happens to polyfill it). Provide the npm polyfill
  // where the global is missing.
  if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
    const { Buffer } = await import("buffer/");
    (globalThis as { Buffer?: unknown }).Buffer = Buffer;
  }
  const [{ CircomRunner, bindings }, { WasmFs }, circomWasm] =
    await Promise.all([
      import("circom2"),
      import("@wasmer/wasmfs"),
      loadCircomWasm(ctx),
    ]);
  const wasmFs = new WasmFs();
  const fs = wasmFs.fs;
  fs.mkdirSync("/out", { recursive: true });
  for (const [path, content] of Object.entries(virtualSources)) {
    fs.writeFileSync(path, content);
  }
  const runner = new CircomRunner({
    args: ["/main.circom", "--r1cs", "--wasm", "-o", "/out"],
    env: {},
    preopens: { "/": "/" },
    bindings: {
      ...bindings,
      fs,
      exit(code: number) {
        throw new CircomExit(code);
      },
    },
  });
  try {
    await runner.execute(circomWasm);
  } catch (err) {
    if (!(err instanceof CircomExit) || err.code !== 0) {
      const stderr = String(fs.readFileSync("/dev/stderr", "utf8"))
        .replace(ANSI_RE, "")
        .trim();
      const diagnostics = stderr.split("\n").slice(0, 20).join("\n");
      throw new ErrorException(
        `@circom:circom: compilation failed:\n${diagnostics || (err as Error).message}`,
      );
    }
  }
  return {
    r1cs: new Uint8Array(fs.readFileSync("/out/main.r1cs") as Uint8Array),
    wasm: new Uint8Array(
      fs.readFileSync("/out/main_js/main.wasm") as Uint8Array,
    ),
  };
}

class CircomExit extends Error {
  constructor(readonly code: number) {
    super(`circom exited with code ${code}`);
  }
}

/**
 * Number of constraints from the r1cs binary header (iden3 binfile
 * format) — standalone so `@circom:constraints` never loads snarkjs.
 */
export function parseR1csConstraints(r1cs: Uint8Array): number {
  const view = new DataView(r1cs.buffer, r1cs.byteOffset, r1cs.byteLength);
  if (r1cs.length < 12 || view.getUint32(0, true) !== 0x73633172) {
    throw new ErrorException("@circom:circom: malformed r1cs (bad magic)");
  }
  const nSections = view.getUint32(8, true);
  let offset = 12;
  for (let s = 0; s < nSections; s++) {
    const type = view.getUint32(offset, true);
    const size = Number(view.getBigUint64(offset + 4, true));
    offset += 12;
    if (type === 1) {
      const n8 = view.getUint32(offset, true);
      // n8, prime, nWires, nPubOut, nPubIn, nPrvIn, nLabels(u64), nConstraints
      return view.getUint32(offset + 4 + n8 + 16 + 8, true);
    }
    offset += size;
  }
  throw new ErrorException(
    "@circom:circom: malformed r1cs (no header section)",
  );
}

// --- cache ---

const compileCache = new Map<string, Promise<CompileCircomResult>>();

export function compileCircomCached(
  sourceArg: string,
  ctx: FetchContext,
): Promise<CompileCircomResult> {
  const compileKey = keccak256(toHex(`${sourceArg}\0{}`));
  let cached = compileCache.get(compileKey);
  if (!cached) {
    cached = compileCircomFresh(sourceArg, compileKey, ctx);
    compileCache.set(compileKey, cached);
    cached.catch(() => compileCache.delete(compileKey));
  }
  return cached;
}

async function compileCircomFresh(
  sourceArg: string,
  compileKey: string,
  ctx: FetchContext,
): Promise<CompileCircomResult> {
  const rootName = isUrl(sourceArg) ? sourceArg : INLINE_ROOT_NAME;
  const rootSource = isUrl(sourceArg)
    ? await fetchSource(sourceArg, ctx)
    : sourceArg;
  const sources = await crawlIncludes(rootSource, rootName, ctx);
  ctx.log?.("@circom:circom: compiling…");
  const { wasm, r1cs } = await runCircom(
    virtualizeSources(sources, rootName),
    ctx,
  );
  return { wasm, r1cs, constraints: parseR1csConstraints(r1cs), compileKey };
}
