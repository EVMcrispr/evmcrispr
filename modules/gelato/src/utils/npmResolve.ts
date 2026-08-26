/**
 * Pure package-entry resolution for the Web3 Function bundler: given a
 * package.json and an import subpath, pick the file esbuild should load,
 * following `exports` (browser/import/module/default conditions), the
 * `browser` field, `module` and `main` — the same order esbuild itself
 * uses for a browser build.
 */

export interface PackageJson {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  exports?: unknown;
  dependencies?: Record<string, string>;
}

const CONDITIONS = ["browser", "import", "module", "default"];

function pickCondition(target: unknown): string | null | undefined {
  if (typeof target === "string") return target;
  if (target === null) return null;
  if (Array.isArray(target)) {
    for (const t of target) {
      const r = pickCondition(t);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (typeof target === "object") {
    const obj = target as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (CONDITIONS.includes(key)) {
        const r = pickCondition(obj[key]);
        if (r !== undefined) return r;
      }
    }
  }
  return undefined;
}

/** Resolve `subpath` ("." or "./x") through the exports map, or undefined when unmapped. */
function resolveExports(
  exports: unknown,
  subpath: string,
): string | null | undefined {
  if (exports === undefined || exports === null) return undefined;
  const isMap =
    typeof exports === "object" &&
    !Array.isArray(exports) &&
    Object.keys(exports as object).some((k) => k.startsWith("."));
  if (!isMap) {
    return subpath === "." ? pickCondition(exports) : undefined;
  }
  const map = exports as Record<string, unknown>;
  if (subpath in map) return pickCondition(map[subpath]);
  // Wildcard patterns, longest prefix first.
  const patterns = Object.keys(map)
    .filter((k) => k.includes("*"))
    .sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split("*");
    if (
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix) &&
      subpath.length >= prefix.length + suffix.length
    ) {
      const star = subpath.slice(prefix.length, subpath.length - suffix.length);
      const target = pickCondition(map[pattern]);
      return target === undefined || target === null
        ? target
        : target.replace("*", star);
    }
  }
  return undefined;
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * The in-package file (no leading "./") an import of `pkg` + `subpath`
 * should load, before extension/index probing. `subpath` is "" for the
 * bare package. Returns null when the package maps the path to nothing
 * (browser: false) and undefined when no mapping applies (probe the path).
 */
export function resolvePackageEntry(
  pkg: PackageJson,
  subpath: string,
): string | null | undefined {
  const key = subpath ? `./${subpath}` : ".";
  const viaExports = resolveExports(pkg.exports, key);
  if (viaExports !== undefined) {
    return viaExports === null ? null : normalize(viaExports);
  }
  if (pkg.exports !== undefined && subpath) {
    // An exports map that does not list the subpath forbids it.
    return null;
  }
  if (subpath) return applyBrowserField(pkg, normalize(subpath));
  const entry =
    (typeof pkg.browser === "string" ? pkg.browser : undefined) ??
    pkg.module ??
    pkg.main ??
    "index.js";
  return applyBrowserField(pkg, normalize(entry));
}

/** Apply an object-form `browser` field (file substitutions) to a path. */
export function applyBrowserField(
  pkg: PackageJson,
  path: string,
): string | null {
  if (typeof pkg.browser !== "object" || pkg.browser === null) return path;
  for (const [from, to] of Object.entries(pkg.browser)) {
    const f = normalize(from);
    if (f === path || f === `${path}.js` || `${f}.js` === path) {
      return to === false ? null : normalize(to);
    }
  }
  return path;
}

export interface Specifier {
  name: string;
  version?: string;
  subpath: string;
}

/** Split `@scope/pkg@1.2.3/sub/path` (version optional) into its parts. */
export function parseSpecifier(spec: string): Specifier | undefined {
  const m = spec.match(/^((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?(?:\/(.*))?$/);
  if (!m) return undefined;
  return { name: m[1], version: m[2], subpath: m[3] ?? "" };
}

export const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);
