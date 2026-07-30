/**
 * Session-cached artifact fetching over http(s)/ipfs for module commands
 * that consume circuit artifacts (zk, noir, …). Supports an optional
 * `#sha256=0x…` URL-fragment integrity pin; ipfs:// content is already
 * hash-verified against the CID by the resolver the caller provides.
 */
import { ErrorException } from "../errors";

export interface FetchContext {
  log?: (message: string) => void;
  /** Fetch an IPFS cid (or cid/path), hash-verified against the CID. */
  fetchIpfs?: (cidPath: string) => Promise<Uint8Array>;
  /** Prefix for error messages, e.g. `"zk:prove: "`. */
  errorPrefix?: string;
}

// Circuit artifacts are immutable in practice, so cache them for the
// session, keyed by the URL as written. Failures are not cached.
const artifactCache = new Map<string, Promise<Uint8Array>>();

export function fetchArtifact(
  url: string,
  what: string,
  ctx: FetchContext,
): Promise<Uint8Array> {
  let cached = artifactCache.get(url);
  if (!cached) {
    cached = fetchArtifactFresh(url, what, ctx);
    artifactCache.set(url, cached);
    cached.catch(() => artifactCache.delete(url));
  }
  return cached;
}

const INTEGRITY_RE = /#sha256=(0x[0-9a-fA-F]{64})$/;

async function fetchArtifactFresh(
  urlWithFragment: string,
  what: string,
  ctx: FetchContext,
): Promise<Uint8Array> {
  const prefix = ctx.errorPrefix ?? "";
  // Optional integrity pin: `<url>#sha256=0x…` — the fragment is stripped
  // before fetching and the response digest must match. (ipfs:// content
  // is already hash-verified against the CID.)
  const integrity = urlWithFragment.match(INTEGRITY_RE);
  const url = integrity
    ? urlWithFragment.slice(0, -integrity[0].length)
    : urlWithFragment;
  const bytes = await fetchArtifactBytes(url, what, ctx);
  if (integrity) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    );
    const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    if (hex !== integrity[1].toLowerCase()) {
      throw new ErrorException(
        `${prefix}${what} (${url}) failed its integrity check — expected sha256 ${integrity[1]}, got ${hex}`,
      );
    }
  }
  return bytes;
}

async function fetchArtifactBytes(
  url: string,
  what: string,
  ctx: FetchContext,
): Promise<Uint8Array> {
  const prefix = ctx.errorPrefix ?? "";
  if (url.startsWith("ipfs://")) {
    if (!ctx.fetchIpfs) {
      throw new ErrorException(
        `${prefix}no IPFS resolver available to fetch ${what} (${url})`,
      );
    }
    try {
      return await ctx.fetchIpfs(url.slice("ipfs://".length));
    } catch (err) {
      throw new ErrorException(
        `${prefix}fetching ${what} (${url}): ${(err as Error).message ?? err}`,
      );
    }
  }
  if (!/^https?:\/\//.test(url)) {
    throw new ErrorException(
      `${prefix}<${what}> must be an http(s):// or ipfs:// URL, got ${url}`,
    );
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ErrorException(
      `${prefix}network error fetching ${what} (${url}): ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `${prefix}${res.status} ${res.statusText} fetching ${what} (${url})`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
