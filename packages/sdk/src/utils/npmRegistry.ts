import {
  ErrorConnection,
  ErrorException,
  ErrorUnexpectedResult,
} from "../errors";

/**
 * Verified npm file fetching: instead of trusting a CDN mirror (unpkg) to
 * serve individual package files, download the package tarball straight
 * from the npm registry, check it against the registry's published
 * `dist.integrity` (the same sha512 every package-lock.json pins), and
 * extract files from the verified archive in memory. A `pkg@version` is
 * immutable on npm, so the integrity hash identifies the content forever —
 * no precomputed hash map needed.
 *
 * Zero-dependency: gzip via the native DecompressionStream, sha-512 via
 * WebCrypto, and a hand-rolled tar reader (ustar prefixes, pax `path`
 * records and GNU long names included).
 */

export const NPM_REGISTRY = "https://registry.npmjs.org";

export interface NpmFileSpec {
  name: string;
  version: string;
  path: string;
}

/** "1.2.3", "1.2.3-rc.1+build" — exact versions only, never ranges/tags. */
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse `pkg@1.2.3/path/file` or `@scope/pkg@1.2.3/path/file` into its
 * package, exact version and in-package path. Returns null when no exact
 * version is pinned (ranges and dist-tags don't count: they're mutable, so
 * there is nothing stable to verify against).
 */
export function parseNpmFileSpec(spec: string): NpmFileSpec | null {
  const m = spec.match(/^(@[^/@]+\/[^/@]+|[^/@]+)@([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, name, version, path] = m;
  if (!EXACT_VERSION_RE.test(version)) return null;
  return { name, version, path };
}

/** The bare package name at the start of an npm-style path, if any. */
export function parseNpmPackageName(path: string): string | undefined {
  const m = path.match(/^(@[^/@]+\/[^/@]+|[^/@]+)(\/|$)/);
  return m?.[1];
}

function encodePackageName(name: string): string {
  return name.replace("/", "%2f");
}

async function fetchOk(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (_) {
    throw new ErrorConnection(`Couldn't fetch ${url}.`);
  }
  if (!response.ok) {
    throw new ErrorConnection(
      `Couldn't fetch ${url} (${response.status} ${response.statusText}).`,
    );
  }
  return response;
}

/** The package's current `latest` dist-tag — used for error suggestions. */
export async function fetchNpmLatestVersion(name: string): Promise<string> {
  const response = await fetchOk(
    `${NPM_REGISTRY}/${encodePackageName(name)}/latest`,
  );
  const meta = (await response.json()) as { version?: string };
  if (!meta.version) {
    throw new ErrorUnexpectedResult(`No latest version found for ${name}.`);
  }
  return meta.version;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Inflate a gzip stream with the native DecompressionStream. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** NUL-terminated string field of a tar header. */
function tarString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const max = offset + length;
  while (end < max && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

/** Value of a pax extended-header record, e.g. `path`. */
function paxRecord(data: string, key: string): string | undefined {
  // Records are "<len> <key>=<value>\n" with <len> covering the whole record.
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(" ", offset);
    if (space < 0) return undefined;
    const len = Number(data.slice(offset, space));
    if (!Number.isFinite(len) || len <= 0) return undefined;
    const record = data.slice(space + 1, offset + len);
    const eq = record.indexOf("=");
    if (eq >= 0 && record.slice(0, eq) === key) {
      return record.slice(eq + 1).replace(/\n$/, "");
    }
    offset += len;
  }
  return undefined;
}

/**
 * Regular files of a tarball, keyed by path with the archive's root
 * directory (npm's `package/`) stripped.
 */
export function untar(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let paxPath: string | undefined;
  let longName: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(tarString(header, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new ErrorUnexpectedResult("malformed tar header");
    }
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    const type = String.fromCharCode(header[156]);
    if (type === "x") {
      paxPath = paxRecord(new TextDecoder().decode(data), "path");
      continue;
    }
    if (type === "L") {
      longName = tarString(data, 0, data.length);
      continue;
    }
    const prefix = tarString(header, 345, 155);
    const nameField = tarString(header, 0, 100);
    const name =
      paxPath ?? longName ?? (prefix ? `${prefix}/${nameField}` : nameField);
    paxPath = undefined;
    longName = undefined;
    if (type !== "0" && type !== "\0") continue; // regular files only
    const slash = name.indexOf("/");
    if (slash < 0) continue;
    files.set(name.slice(slash + 1), data);
  }
  return files;
}

/** Extracted-and-verified tarballs, keyed by name@version (immutable). */
const tarballCache = new Map<string, Promise<Map<string, Uint8Array>>>();

function fetchVerifiedTarball(
  name: string,
  version: string,
): Promise<Map<string, Uint8Array>> {
  const key = `${name}@${version}`;
  let cached = tarballCache.get(key);
  if (!cached) {
    cached = fetchVerifiedTarballFresh(name, version);
    tarballCache.set(key, cached);
    cached.catch(() => tarballCache.delete(key));
  }
  return cached;
}

async function fetchVerifiedTarballFresh(
  name: string,
  version: string,
): Promise<Map<string, Uint8Array>> {
  const metaRes = await fetchOk(
    `${NPM_REGISTRY}/${encodePackageName(name)}/${version}`,
  );
  let meta: { dist?: { integrity?: string; tarball?: string } };
  try {
    meta = await metaRes.json();
  } catch (_) {
    throw new ErrorUnexpectedResult(
      `Couldn't parse the npm registry metadata for ${name}@${version}.`,
    );
  }
  const integrity = meta.dist?.integrity;
  const tarballUrl = meta.dist?.tarball;
  if (!tarballUrl) {
    throw new ErrorUnexpectedResult(
      `The npm registry lists no tarball for ${name}@${version}.`,
    );
  }
  if (!integrity?.startsWith("sha512-")) {
    throw new ErrorUnexpectedResult(
      `${name}@${version} publishes no sha512 integrity — its download cannot be verified`,
    );
  }

  const tgz = new Uint8Array(await (await fetchOk(tarballUrl)).arrayBuffer());
  const digest = toBase64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-512", tgz as unknown as ArrayBuffer),
    ),
  );
  if (digest !== integrity.slice("sha512-".length)) {
    throw new ErrorUnexpectedResult(
      `the downloaded tarball for ${name}@${version} does not match its registry integrity hash`,
    );
  }

  return untar(await gunzip(tgz));
}

/**
 * Fetch one file out of `pkg@version`, from a tarball verified against the
 * npm registry's integrity hash. Tarballs are cached per `pkg@version` for
 * the session, so a package's whole import closure costs one download.
 */
export async function fetchVerifiedNpmFile(
  spec: NpmFileSpec,
): Promise<Uint8Array> {
  const files = await fetchVerifiedTarball(spec.name, spec.version);
  const file = files.get(spec.path);
  if (file === undefined) {
    throw new ErrorException(
      `${spec.name}@${spec.version} contains no file "${spec.path}"`,
    );
  }
  return file;
}
