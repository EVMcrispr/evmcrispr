import { ErrorException } from "@evmcrispr/sdk";
import { CORS_PROXY_PREFIX, W3F_UPLOAD_URL } from "../addresses";

/** Route a Gelato API URL through the CORS proxy when running in a browser. */
export function proxied(url: string): string {
  const inBrowser =
    typeof window !== "undefined" ||
    typeof (globalThis as { importScripts?: unknown }).importScripts ===
      "function";
  return inBrowser ? CORS_PROXY_PREFIX + url : url;
}

/** Upload a packed Web3 Function tgz to Gelato's function store → CID. */
export async function uploadWeb3Function(
  tgz: Uint8Array,
  title: string,
): Promise<string> {
  const form = new FormData();
  form.append("title", title);
  form.append(
    "file",
    new Blob([tgz as BlobPart], { type: "application/gzip" }),
    "web3Function.tgz",
  );
  let res: Response;
  try {
    res = await fetch(proxied(W3F_UPLOAD_URL), { method: "POST", body: form });
  } catch {
    throw new ErrorException(
      "couldn't reach Gelato's function store to upload",
    );
  }
  let body: { cid?: string; message?: string } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body — reported through the status below
  }
  if (res.status === 503) {
    throw new ErrorException(
      "Gelato's function store is refusing uploads right now (503 — the same endpoint `npx w3f deploy` uses); retry later",
    );
  }
  if (!res.ok || !body.cid) {
    throw new ErrorException(
      `Gelato rejected the Web3 Function upload (${res.status}${body.message ? `: ${body.message}` : ""})`,
    );
  }
  return body.cid;
}
