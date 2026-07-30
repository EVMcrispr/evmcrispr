/**
 * snarkjs plumbing for `zk:prove`: lazy loading of the (heavy) snarkjs
 * bundle, artifact fetching over http(s)/ipfs with a session cache, and
 * the Groth16 fullProve call over in-memory artifacts (identical code
 * path in the browser and under bun).
 */
import { ErrorException } from "@evmcrispr/sdk";

export interface FetchContext {
  log?: (message: string) => void;
  /** Map an ipfs://<cid> URL to a fetchable gateway URL. */
  resolveIpfs?: (url: string) => string | Promise<string>;
}

type Snarkjs = {
  groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: { type: "mem"; data: Uint8Array },
      zkey: { type: "mem"; data: Uint8Array },
    ): Promise<{
      proof: Record<string, unknown>;
      publicSignals: string[];
    }>;
  };
};

let snarkjsPromise: Promise<Snarkjs> | undefined;

/** Load snarkjs on first use — it must never load with the module. */
export function loadSnarkjs(): Promise<Snarkjs> {
  if (!snarkjsPromise) {
    snarkjsPromise = importSnarkjs();
    snarkjsPromise.catch(() => {
      snarkjsPromise = undefined;
    });
  }
  return snarkjsPromise;
}

async function importSnarkjs(): Promise<Snarkjs> {
  const snarkjs = (await import("snarkjs")) as Snarkjs & {
    curves: {
      getCurveFromName(
        name: string,
        options?: { singleThread?: boolean },
      ): Promise<unknown>;
    };
  };
  // ffjavascript's worker-thread pool crashes under bun/node workers-in-CLI
  // contexts; pre-seed its global curve cache with a single-threaded build
  // so every snarkjs-internal buildBn128() call reuses it. The browser
  // keeps the (working) multi-threaded pool.
  if (
    typeof process !== "undefined" &&
    process.versions?.node &&
    !(globalThis as Record<string, unknown>).curve_bn128
  ) {
    (globalThis as Record<string, unknown>).curve_bn128 =
      await snarkjs.curves.getCurveFromName("bn128", { singleThread: true });
  }
  return snarkjs;
}

async function toFetchUrl(
  url: string,
  what: string,
  ctx: FetchContext,
): Promise<string> {
  if (url.startsWith("ipfs://")) {
    if (!ctx.resolveIpfs) {
      throw new ErrorException(
        `zk:prove: no IPFS resolver available to fetch ${what} (${url})`,
      );
    }
    return ctx.resolveIpfs(url);
  }
  if (/^https?:\/\//.test(url)) {
    return url;
  }
  throw new ErrorException(
    `zk:prove: <${what}> must be an http(s):// or ipfs:// URL, got ${url}`,
  );
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

async function fetchArtifactFresh(
  url: string,
  what: string,
  ctx: FetchContext,
): Promise<Uint8Array> {
  const fetchUrl = await toFetchUrl(url, what, ctx);
  let res: Response;
  try {
    res = await fetch(fetchUrl);
  } catch (err) {
    throw new ErrorException(
      `zk:prove: network error fetching ${what} (${url}): ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `zk:prove: ${res.status} ${res.statusText} fetching ${what} (${url})`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function groth16FullProve(
  inputs: Record<string, unknown>,
  wasm: Uint8Array,
  zkey: Uint8Array,
): Promise<{ proof: Record<string, unknown>; publicSignals: string[] }> {
  const snarkjs = await loadSnarkjs();
  return snarkjs.groth16.fullProve(
    inputs,
    { type: "mem", data: wasm },
    { type: "mem", data: zkey },
  );
}
