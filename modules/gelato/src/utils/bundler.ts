/**
 * Bundle a Web3 Function the way `w3f deploy` does — esbuild, browser
 * platform, ESM, es2022, minified, XMLHttpRequest polyfill injected — but
 * in the terminal: esbuild-wasm runs in-process and every npm import is
 * served from a tarball verified against the registry and pinned by
 * src/utils/w3fLock.ts.
 */
import {
  ErrorException,
  fetchNpmLatestVersion,
  fetchVerifiedNpmFile,
} from "@evmcrispr/sdk";
import type { Plugin } from "esbuild-wasm";
import {
  applyBrowserField,
  NODE_BUILTINS,
  type PackageJson,
  parseSpecifier,
  resolvePackageEntry,
} from "./npmResolve";
import { W3F_HOISTED, W3F_LOCK, W3F_ROOTS } from "./w3fLock";

/** esbuild-wasm release the module depends on; the browser fetches its wasm from the registry. */
export const ESBUILD_VERSION = "0.28.2";

const SDK = "@gelatonetwork/web3-functions-sdk";
const POLYFILL = "dist/lib/polyfill/XMLHttpRequest.js";
const NAMESPACE = "npm";
/** Gelato refuses Web3 Function downloads above this size. */
export const MAX_BUNDLE_BYTES = 1024 * 1024;

const isBrowser = () =>
  typeof window !== "undefined" ||
  typeof (globalThis as { importScripts?: unknown }).importScripts ===
    "function";

type Esbuild = typeof import("esbuild-wasm");
let esbuildPromise: Promise<Esbuild> | undefined;

/** esbuild-wasm, initialized once per session. */
export function loadEsbuild(log?: (message: string) => void): Promise<Esbuild> {
  if (!esbuildPromise) {
    esbuildPromise = (async () => {
      const esbuild = await import("esbuild-wasm");
      if (isBrowser()) {
        log?.(
          `gelato:publish-function: downloading esbuild v${ESBUILD_VERSION} (~4 MB, first use only)…`,
        );
        const wasm = await fetchVerifiedNpmFile({
          name: "esbuild-wasm",
          version: ESBUILD_VERSION,
          path: "esbuild.wasm",
        });
        await esbuild.initialize({
          wasmModule: await WebAssembly.compile(wasm as unknown as ArrayBuffer),
          worker: false,
        });
      } else {
        await esbuild.initialize({});
      }
      return esbuild;
    })();
    esbuildPromise.catch(() => {
      esbuildPromise = undefined;
    });
  }
  return esbuildPromise;
}

interface PkgRef {
  name: string;
  version: string;
}

const pkgJsonCache = new Map<string, Promise<PackageJson>>();

/** package.json of `name@version` (fetching and verifying the tarball once). */
function packageJson(ref: PkgRef): Promise<PackageJson> {
  const key = `${ref.name}@${ref.version}`;
  let cached = pkgJsonCache.get(key);
  if (!cached) {
    cached = fetchVerifiedNpmFile({ ...ref, path: "package.json" }).then(
      (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as PackageJson,
    );
    pkgJsonCache.set(key, cached);
    cached.catch(() => pkgJsonCache.delete(key));
  }
  return cached;
}

/** File bytes, or undefined when the (already verified) tarball lacks it. */
async function readFile(
  ref: PkgRef,
  path: string,
): Promise<Uint8Array | undefined> {
  await packageJson(ref);
  try {
    return await fetchVerifiedNpmFile({ ...ref, path });
  } catch {
    return undefined;
  }
}

const EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".ts", ".json"];

/** Node-style file probing inside a package: extensions, then directory index. */
async function probe(ref: PkgRef, path: string): Promise<string | undefined> {
  for (const ext of EXTENSIONS) {
    if ((await readFile(ref, path + ext)) !== undefined) return path + ext;
  }
  const dirPkg = await readFile(ref, `${path}/package.json`);
  if (dirPkg !== undefined) {
    const pj = JSON.parse(new TextDecoder().decode(dirPkg)) as PackageJson;
    const entry = pj.module ?? pj.main;
    if (entry) {
      const found = await probe(ref, join(path, entry));
      if (found) return found;
    }
  }
  for (const ext of EXTENSIONS.slice(1)) {
    const index = `${path}/index${ext}`;
    if ((await readFile(ref, index)) !== undefined) return index;
  }
  return undefined;
}

function join(base: string, rel: string): string {
  const out = base ? base.split("/") : [];
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function loaderFor(path: string): "js" | "ts" | "json" | "text" {
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".json")) return "json";
  return "js";
}

/** The version `name` resolves to from `importer` (a package or the entry). */
function pinnedVersion(name: string, importer?: PkgRef): string | undefined {
  // Declared dependency first; otherwise the hoisted view, which is what an
  // undeclared import gets in the node_modules tree `w3f deploy` bundles.
  return (
    (importer && W3F_LOCK[`${importer.name}@${importer.version}`]?.[name]) ??
    W3F_HOISTED[name]
  );
}

async function unpinnedError(name: string, importer?: PkgRef): Promise<never> {
  let suggestion = "";
  try {
    suggestion = ` — pin it as "${name}@${await fetchNpmLatestVersion(name)}"`;
  } catch {
    // no suggestion available offline
  }
  throw new ErrorException(
    importer
      ? `${importer.name}@${importer.version} imports "${name}", which is outside the audited Web3 Function dependency set (modules/gelato/scripts/generate-w3f-lock.ts)`
      : `import of "${name}" is not pinned: bare imports are allowed for ${Object.keys(W3F_ROOTS).join(", ")}${suggestion}`,
  );
}

/** esbuild plugin serving npm packages from verified, lock-pinned tarballs. */
export function npmPlugin(): Plugin {
  return {
    name: "evmcrispr-npm",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        const importer = args.pluginData as PkgRef | undefined;
        const spec = args.path;

        if (spec.startsWith(".") || spec.startsWith("/")) {
          if (!importer) {
            throw new ErrorException(
              `relative import "${spec}" — a published Web3 Function is a single file; inline the code or import an npm package`,
            );
          }
          const fromDir = dirname(
            args.importer.slice(`${importer.name}@${importer.version}/`.length),
          );
          const pj = await packageJson(importer);
          const mapped = applyBrowserField(pj, join(fromDir, spec));
          if (mapped === null) {
            return { path: "empty", namespace: "empty" };
          }
          const found = await probe(importer, mapped);
          if (!found) {
            throw new ErrorException(
              `${importer.name}@${importer.version} imports "${spec}" from ${args.importer}, which its tarball does not contain`,
            );
          }
          return {
            path: `${importer.name}@${importer.version}/${found}`,
            namespace: NAMESPACE,
            pluginData: importer,
          };
        }

        // The importing package's `browser` field may disable or swap a
        // bare module (e.g. the SDK maps "buffer" to false).
        if (importer) {
          const importerPj = await packageJson(importer);
          if (
            typeof importerPj.browser === "object" &&
            importerPj.browser !== null &&
            spec in importerPj.browser
          ) {
            const mapped = importerPj.browser[spec];
            if (mapped === false) return { path: "empty", namespace: "empty" };
            if (mapped.startsWith(".")) {
              const found = await probe(importer, join("", mapped));
              if (found) {
                return {
                  path: `${importer.name}@${importer.version}/${found}`,
                  namespace: NAMESPACE,
                  pluginData: importer,
                };
              }
            }
          }
        }
        const parsed = parseSpecifier(spec.replace(/^node:/, ""));
        if (!parsed) {
          throw new ErrorException(`cannot resolve import "${spec}"`);
        }
        const version = parsed.version ?? pinnedVersion(parsed.name, importer);
        if (!version) {
          // Browser polyfill packages (buffer, events…) resolve above when
          // pinned; only an unresolvable builtin name is a real builtin.
          if (spec.startsWith("node:") || NODE_BUILTINS.has(parsed.name)) {
            throw new ErrorException(
              `"${spec}" is a Node.js builtin — Web3 Functions run in a browser-like sandbox without it`,
            );
          }
          return unpinnedError(parsed.name, importer);
        }
        if (parsed.version && !/^\d+\.\d+\.\d+/.test(parsed.version)) {
          throw new ErrorException(
            `"${spec}": pin an exact version like ${parsed.name}@1.2.3`,
          );
        }
        const ref: PkgRef = { name: parsed.name, version };
        const pj = await packageJson(ref);
        const entry = resolvePackageEntry(pj, parsed.subpath);
        if (entry === null) return { path: "empty", namespace: "empty" };
        const found = await probe(ref, entry ?? parsed.subpath);
        if (!found) {
          throw new ErrorException(
            `${ref.name}@${ref.version} has no entry for "${spec}"`,
          );
        }
        return {
          path: `${ref.name}@${ref.version}/${found}`,
          namespace: NAMESPACE,
          pluginData: ref,
        };
      });

      build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({
        contents: "export default {};",
        loader: "js",
      }));

      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        const ref = args.pluginData as PkgRef;
        const path = args.path.slice(`${ref.name}@${ref.version}/`.length);
        const bytes = await readFile(ref, path);
        if (bytes === undefined) {
          throw new ErrorException(`${args.path} vanished while bundling`);
        }
        return {
          contents: bytes,
          loader: loaderFor(path),
          pluginData: ref,
        };
      });
    },
  };
}

export interface BundleResult {
  /** Minified, self-contained ESM the Gelato runtime executes. */
  indexJs: string;
  /** The author's source transpiled to JS, imports left as written. */
  sourceJs: string;
  warnings: string[];
}

/** Bundle a single-file TypeScript Web3 Function. */
export async function bundleWeb3Function(
  source: string,
  log?: (message: string) => void,
): Promise<BundleResult> {
  const esbuild = await loadEsbuild(log);
  const sdkVersion = W3F_ROOTS[SDK];
  let result: Awaited<ReturnType<Esbuild["build"]>>;
  try {
    result = await esbuild.build({
      stdin: {
        contents: source,
        loader: "ts",
        sourcefile: "index.ts",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      inject: [`${SDK}@${sdkVersion}/${POLYFILL}`],
      plugins: [npmPlugin()],
      logLevel: "silent",
    });
  } catch (err) {
    throw new ErrorException(formatEsbuildError(err));
  }
  const transpiled = await esbuild.transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });
  return {
    indexJs: result.outputFiles?.[0]?.text ?? "",
    sourceJs: transpiled.code,
    warnings: result.warnings.map((w) => w.text),
  };
}

function formatEsbuildError(err: unknown): string {
  const e = err as {
    message?: string;
    errors?: { text: string; location?: { line: number; column: number } }[];
  };
  const first = e.errors?.[0];
  if (first) {
    const where = first.location
      ? ` (index.ts:${first.location.line}:${first.location.column})`
      : "";
    // Plugin errors carry our own message inside esbuild's wrapper.
    const text = first.text.replace(/^\[plugin evmcrispr-npm\] /, "");
    return `gelato:publish-function: ${text}${where}`;
  }
  return `gelato:publish-function: ${e.message ?? String(err)}`;
}
