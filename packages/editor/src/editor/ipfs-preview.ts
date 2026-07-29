import { IPFS_GATEWAY } from "@evmcrispr/core";

/** Bytes requested from the gateway for a text preview. */
const PREVIEW_TEXT_BYTES = 2048;
/** Characters of text shown in the hover before truncating. */
const PREVIEW_TEXT_CHARS = 1000;
const PREVIEW_FETCH_TIMEOUT_MS = 5000;
const PREVIEW_IMAGE_HEIGHT = 200;

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{20,})$/;

export type IpfsGetCall = {
  cid: string;
  /** 1-based, inclusive. */
  startColumn: number;
  /** 1-based, exclusive. */
  endColumn: number;
};

/**
 * Find an `@ipfs.get("<cid>")` call spanning the given 1-based column of a
 * line, returning its CID and column range.
 */
export function findIpfsGetCallAt(
  line: string,
  column: number,
): IpfsGetCall | null {
  const calls = line.matchAll(/@ipfs\.get\(\s*(['"])([^'"]*)\1\s*\)/g);
  for (const m of calls) {
    const startColumn = m.index + 1;
    const endColumn = startColumn + m[0].length;
    if (column < startColumn || column > endColumn) continue;
    const cid = m[2];
    if (!CID_PATTERN.test(cid)) return null;
    return { cid, startColumn, endColumn };
  }
  return null;
}

const previewCache = new Map<string, Promise<string | null>>();
const readyPreviews = new Map<string, string | null>();

/**
 * The resolved preview for a CID, `undefined` while it's still loading.
 * Lets the hover provider answer synchronously and show a placeholder
 * instead of blocking the hover on gateway round-trips.
 */
export function peekIpfsPreview(cid: string): string | null | undefined {
  return readyPreviews.get(cid);
}

/** Placeholder hover shown while the preview is being fetched. */
export function loadingPreview(cid: string): string {
  const url = `${IPFS_GATEWAY}${cid}`;
  return `**IPFS** · [\`${shortenCid(cid)}\`](${url}) · loading preview…`;
}

/**
 * Markdown preview of the file behind a CID: the image itself for images, a
 * truncated code block for text, and a content-type line with a gateway link
 * otherwise. Results are cached per CID; failures are not, so a later hover
 * retries.
 */
export function getIpfsPreview(cid: string): Promise<string | null> {
  let preview = previewCache.get(cid);
  if (!preview) {
    preview = fetchPreview(cid).catch(() => null);
    previewCache.set(cid, preview);
    preview.then((value) => {
      readyPreviews.set(cid, value);
      if (value === null) previewCache.delete(cid);
    });
  }
  return preview;
}

async function fetchPreview(cid: string): Promise<string | null> {
  const url = `${IPFS_GATEWAY}${cid}`;
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${PREVIEW_TEXT_BYTES - 1}` },
    signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const type = (response.headers.get("Content-Type") ?? "").split(";")[0];
  const size = totalSize(response);
  const meta = [type || "unknown type", size && formatBytes(Number(size))]
    .filter(Boolean)
    .join(", ");
  const title = `**IPFS file** · [\`${shortenCid(cid)}\`](${url}) · ${meta}`;

  if (type.startsWith("image/")) {
    response.body?.cancel();
    return `${title}\n\n---\n\n![preview](${url}|height=${PREVIEW_IMAGE_HEIGHT})`;
  }

  // Directories surface as text/html (a generated listing, or a contained
  // index.html); the dag-json probe tells them apart from real HTML files.
  if (type === "text/html" || type === "") {
    const listing = await dirListing(cid);
    if (listing) {
      response.body?.cancel();
      const dirTitle = `**IPFS folder** · [\`${shortenCid(cid)}\`](${url}) · ${listing.count} ${listing.count === 1 ? "entry" : "entries"}`;
      return `${dirTitle}\n\n---\n\n${listing.markdown}`;
    }
  }

  const maybeText =
    type.startsWith("text/") ||
    type.includes("json") ||
    type === "" ||
    type === "application/octet-stream";
  if (maybeText) {
    const text = await readHead(response, PREVIEW_TEXT_BYTES);
    if (!looksLikeText(text)) return title;
    const truncated =
      text.length > PREVIEW_TEXT_CHARS || wasTruncated(response);
    const snippet = text.slice(0, PREVIEW_TEXT_CHARS).trimEnd();
    const language = detectLanguage(type, snippet);
    const body = codeFence(language, snippet, truncated);
    return `${title}\n\n---\n\n${body}`;
  }

  response.body?.cancel();
  return title;
}

/** Recursion depth below the root shown in a folder preview. */
const MAX_DIR_DEPTH = 2;
/** Entries rendered per directory before truncating with `…`. */
const MAX_DIR_ENTRIES = 20;

type DagLink = { name: string; cid: string };

const dagDirCache = new Map<string, Promise<DagLink[] | null>>();

/**
 * Named links of a UnixFS directory node via the gateway's dag-json
 * endpoint, or null when the CID is not a plain directory.
 */
function fetchDagDir(cid: string): Promise<DagLink[] | null> {
  let links = dagDirCache.get(cid);
  if (!links) {
    links = (async () => {
      const response = await fetch(`${IPFS_GATEWAY}${cid}?format=dag-json`, {
        signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;

      // DAG-JSON keys are sorted, so `Data` always precedes `Links`. A
      // UnixFS directory's Data is exactly 0x08 0x01 ("CAE" in base64) —
      // sniff the stream head and bail early for files, whose dag-json
      // would otherwise inline their whole content.
      const decoder = new TextDecoder();
      let text = "";
      while (text.length < 512) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      if (!text.includes('"bytes":"CAE"')) {
        reader.cancel().catch(() => {});
        return null;
      }
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();

      const dag = JSON.parse(text);
      const raw: { Name?: string; Hash?: { "/"?: string } }[] =
        dag?.Links ?? [];
      return raw
        .filter((l) => l.Name && l.Hash?.["/"])
        .map((l) => ({ name: l.Name as string, cid: l.Hash?.["/"] as string }));
    })().catch(() => null);
    dagDirCache.set(cid, links);
    links.then((value) => {
      if (value === null) dagDirCache.delete(cid);
    });
  }
  return links;
}

/**
 * Markdown tree of a directory CID: entries link to their gateway path
 * under the root CID, subdirectories expand up to `MAX_DIR_DEPTH`.
 */
async function dirListing(
  cid: string,
): Promise<{ markdown: string; count: number } | null> {
  const links = await fetchDagDir(cid);
  if (!links) return null;
  const lines: string[] = [];
  await renderDirEntries(cid, "", links, 0, lines);
  return { markdown: lines.join("\n"), count: links.length };
}

async function renderDirEntries(
  rootCid: string,
  basePath: string,
  links: DagLink[],
  depth: number,
  lines: string[],
): Promise<void> {
  const indent = "  ".repeat(depth);
  const shown = links.slice(0, MAX_DIR_ENTRIES);
  // All entries of a directory (and their subtrees) resolve concurrently;
  // only the final line assembly is ordered.
  const subtrees = await Promise.all(
    shown.map(async (link) => {
      const path = basePath ? `${basePath}/${link.name}` : link.name;
      const children = await fetchDagDir(link.cid);
      const subLines: string[] = [];
      if (children && depth < MAX_DIR_DEPTH) {
        await renderDirEntries(rootCid, path, children, depth + 1, subLines);
      }
      return { path, isDir: children !== null, subLines };
    }),
  );
  for (const [i, link] of shown.entries()) {
    const { path, isDir, subLines } = subtrees[i];
    const href = `${IPFS_GATEWAY}${rootCid}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const label = link.name.replace(/([[\]\\])/g, "\\$1");
    lines.push(`${indent}- ${isDir ? "📁" : "📄"} [${label}](${href})`);
    lines.push(...subLines);
  }
  if (links.length > MAX_DIR_ENTRIES) lines.push(`${indent}- …`);
}

const SOLIDITY_HINT =
  /\bpragma\s+solidity\b|SPDX-License-Identifier|\b(?:contract|interface|library)\s+\w+\s*\{/;

/**
 * Language id for the preview's code fence. Monaco's CDN bundle ships
 * tokenizers for all ids used here; `plaintext` renders uncolored.
 */
function detectLanguage(type: string, snippet: string): string {
  if (type.includes("json")) return "json";
  if (SOLIDITY_HINT.test(snippet)) return "sol";
  return "plaintext";
}

/**
 * A fenced code block tokenized by Monaco. The fence must be longer than
 * any backtick run inside the content, which also means the content can't
 * break out of it.
 */
function codeFence(
  language: string,
  snippet: string,
  truncated: boolean,
): string {
  const runs = snippet.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
  return `${fence}${language}\n${snippet}${truncated ? "\n…" : ""}\n${fence}`;
}

/** Whether decoded bytes look like text rather than binary data. */
function looksLikeText(text: string): boolean {
  if (!text || text.includes("\uFFFD")) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Control characters other than \t \n \v \f \r (9\u201313) mean binary.
    if (c < 32 && (c < 9 || c > 13)) return false;
  }
  return true;
}

/** Abbreviate a CID for display: `QmPK1s…gpqB`. */
function shortenCid(cid: string): string {
  return cid.length <= 12 ? cid : `${cid.slice(0, 6)}…${cid.slice(-4)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Read at most `maxBytes` from the response body, then cancel it — gateways
 * that ignore the `Range` request header would otherwise stream the whole
 * file.
 */
async function readHead(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }
  reader.cancel().catch(() => {});

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged.slice(0, maxBytes));
}

/** Whether the previewed file is larger than the requested range. */
function wasTruncated(response: Response): boolean {
  const total = totalSize(response);
  return total !== null && Number(total) > PREVIEW_TEXT_BYTES;
}

/** Total file size from a range response's `Content-Range`, if present. */
function totalSize(response: Response): string | null {
  const range = response.headers.get("Content-Range");
  const total = range?.match(/\/(\d+)$/)?.[1];
  return total ?? response.headers.get("Content-Length");
}
