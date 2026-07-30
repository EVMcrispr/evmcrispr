import { IPFS_GATEWAY, verifiedIpfsEntity } from "@evmcrispr/core";

/** Bytes of verified file head fetched for a text preview. */
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
 * truncated code block for text, and a size line with a gateway link
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

/**
 * Everything shown is derived from hash-verified data: the entity comes from
 * the sdk's trustless CAR fetch (`entity-bytes` keeps the transfer to a file
 * head), the kind/size from its UnixFS metadata, and the snippet/type
 * sniffing from the verified head bytes — never from gateway headers. The
 * one exception is image pixels: the `![…](gateway url)` is rendered by
 * Monaco straight from the gateway, so only the image's type is vouched for.
 */
async function fetchPreview(cid: string): Promise<string | null> {
  const url = `${IPFS_GATEWAY}${cid}`;
  const entity = await verifiedIpfsEntity(cid, IPFS_GATEWAY, {
    maxBytes: PREVIEW_TEXT_BYTES,
    signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
  });

  if (entity.kind === "directory") {
    const count = entity.entries.length;
    const listing = await dirListing(cid, entity.entries);
    const dirTitle = `**IPFS folder** · [\`${shortenCid(cid)}\`](${url}) · ${count} ${count === 1 ? "entry" : "entries"}`;
    return `${dirTitle}\n\n---\n\n${listing}`;
  }

  const head = entity.bytes;
  // A cut-off multibyte sequence at the head's end is truncation, not
  // binary data — stream mode drops the trailing partial code point.
  const text = new TextDecoder().decode(head, { stream: !entity.complete });
  const image = sniffImageType(head, text);
  const isText = !image && looksLikeText(text);
  const meta = [
    image ?? (isText ? "text" : "binary"),
    entity.size !== undefined && formatBytes(entity.size),
  ]
    .filter(Boolean)
    .join(", ");
  const title = `**IPFS file** · [\`${shortenCid(cid)}\`](${url}) · ${meta}`;

  if (image) {
    return `${title}\n\n---\n\n![preview](${url}|height=${PREVIEW_IMAGE_HEIGHT})`;
  }
  if (!isText) return title;

  const truncated = !entity.complete || text.length > PREVIEW_TEXT_CHARS;
  const snippet = text.slice(0, PREVIEW_TEXT_CHARS).trimEnd();
  const body = codeFence(detectLanguage(snippet), snippet, truncated);
  return `${title}\n\n---\n\n${body}`;
}

/** Image mime type from the verified head's magic bytes, or null. */
function sniffImageType(head: Uint8Array, text: string): string | null {
  const startsWith = (magic: number[], offset = 0) =>
    magic.every((b, i) => head[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/.test(text)) {
    return "image/svg+xml";
  }
  return null;
}

/** Recursion depth below the root shown in a folder preview. */
const MAX_DIR_DEPTH = 2;
/** Entries rendered per directory before truncating with `…`. */
const MAX_DIR_ENTRIES = 20;

type DagLink = { name: string; cid: string };

const dirEntriesCache = new Map<string, Promise<DagLink[] | null>>();

/**
 * Verified entries of a UnixFS directory node, or null when the CID is not
 * a plain directory. `maxBytes: 0` keeps file probes to their root block.
 */
function fetchDirEntries(cid: string): Promise<DagLink[] | null> {
  let entries = dirEntriesCache.get(cid);
  if (!entries) {
    entries = (async () => {
      const entity = await verifiedIpfsEntity(cid, IPFS_GATEWAY, {
        maxBytes: 0,
        signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
      });
      return entity.kind === "directory" ? entity.entries : null;
    })().catch(() => null);
    dirEntriesCache.set(cid, entries);
    entries.then((value) => {
      if (value === null) dirEntriesCache.delete(cid);
    });
  }
  return entries;
}

/**
 * Markdown tree of a directory CID: entries link to their gateway path
 * under the root CID, subdirectories expand up to `MAX_DIR_DEPTH`.
 */
async function dirListing(cid: string, links: DagLink[]): Promise<string> {
  dirEntriesCache.set(cid, Promise.resolve(links));
  const lines: string[] = [];
  await renderDirEntries(cid, "", links, 0, lines);
  return lines.join("\n");
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
      const children = await fetchDirEntries(link.cid);
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
function detectLanguage(snippet: string): string {
  if (/^\s*[[{]/.test(snippet)) return "json";
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
  if (!text || text.includes("�")) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Control characters other than \t \n \v \f \r (9–13) mean binary.
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
