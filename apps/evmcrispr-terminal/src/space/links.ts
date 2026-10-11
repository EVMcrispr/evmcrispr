import {
  decryptPayload,
  encryptScript,
  isEncryptedEnvelope,
  type SharePayload,
  unsupportedMinVersion,
} from "@evmcrispr/core";
import {
  deriveTitle,
  isReviewed,
  MalformedExport,
  shareOf,
} from "@evmcrispr/space";
import { cid } from "is-ipfs";
import { MAX_EXPORT_CHARS, readExport, type SpaceExport } from "./export";
import type { LiveSpace } from "./live-space";

export function isCID(s: string | undefined): s is string {
  return !!s && !!cid(s);
}

export type EncryptedReason = "missing-key" | "invalid-key" | "needs-upgrade";

export type SharedScript =
  | { status: "found"; title: string; script: string; encrypted: boolean }
  | { status: "error" }
  | { status: "encrypted"; reason: EncryptedReason; requiredVersion?: string }
  /** The link is an exported space, checked. Nothing was made of it: what
   *  to do with it is the user's to say. */
  | { status: "space"; exported: SpaceExport }
  /** An exported space this version does not take in: `why` says what is
   *  wrong with it, for the person who opened the link. */
  | { status: "refused"; why: string };

const TOO_LARGE = "it holds more than a link may";

/**
 * What a share link points at. Pins are JSON share envelopes (encrypted, or
 * a bare `{title, script}`) or plain-text scripts. A pin from a future
 * format is reported before anything else, with or without a key.
 */
export async function fetchShared(
  id: string,
  key: string | undefined,
  fetchText: (cid: string) => Promise<string | undefined>,
): Promise<SharedScript> {
  let text: string | undefined;
  try {
    text = await fetchText(id);
  } catch {
    return { status: "error" };
  }
  if (!text) return { status: "error" };
  // Sizes first, each before the work it bounds: the pin before it is
  // parsed, the ciphertext before it is decrypted (what it decrypts to is
  // smaller, so that is bounded before it is parsed too).
  if (
    text.length > MAX_EXPORT_CHARS + 10_000 &&
    text.trimStart().startsWith("{")
  )
    return { status: "refused", why: TOO_LARGE };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (data === null || typeof data !== "object")
    return { status: "found", title: "", script: text, encrypted: false };

  const requiredVersion = unsupportedMinVersion(data);
  if (requiredVersion)
    return { status: "encrypted", reason: "needs-upgrade", requiredVersion };
  if (isEncryptedEnvelope(data)) {
    if (data.data.length > MAX_EXPORT_CHARS)
      return { status: "refused", why: TOO_LARGE };
    if (!key) return { status: "encrypted", reason: "missing-key" };
    let payload: SharePayload;
    try {
      payload = await decryptPayload(data, key);
    } catch (error) {
      return error instanceof Error &&
        error.message === "Malformed space export"
        ? { status: "refused", why: "it is not a space this version reads" }
        : { status: "encrypted", reason: "invalid-key" };
    }
    if (payload.kind !== "space")
      return {
        status: "found",
        title: payload.title,
        script: payload.script,
        encrypted: true,
      };
    try {
      // All of it is checked here, before anyone is asked anything.
      return { status: "space", exported: readExport(payload, id) };
    } catch (error) {
      if (error instanceof MalformedExport)
        return { status: "refused", why: error.message };
      throw error;
    }
  }
  const bare = data as { title?: unknown; script?: unknown };
  if (typeof bare.title === "string" && typeof bare.script === "string")
    return {
      status: "found",
      title: bare.title,
      script: bare.script,
      encrypted: false,
    };
  return { status: "error" };
}

export type Shared =
  | { ok: true; url: string; cid: string; key: string }
  /** `text` is not the script the user approved in that space. */
  | { ok: false; reason: "unreviewed" }
  /** The revision is not in the timeline (any more). */
  | { ok: false; reason: "gone" };

interface ShareDeps {
  pin(envelope: unknown, name: string): Promise<{ IpfsHash: string }>;
  origin: string;
  viewMode: "edit" | "view";
}

/** A share link. The key travels only in its fragment and must stay its
 *  LAST segment: react-router splits the fragment on `#` before `?`. */
const shareUrl = (
  { cid, key }: { cid: string; key: string },
  deps: Pick<ShareDeps, "origin" | "viewMode">,
) =>
  `${deps.origin}/#/${cid}${deps.viewMode === "view" ? "?mode=view" : ""}#${key}`;

/**
 * Shares one revision of `space` and remembers its link: the share is an
 * entry of its own beside the revision, which is never rewritten. A
 * revision shared from here before hands back the same link, with nothing
 * pinned. Otherwise its text goes through `shareScript`, so only the
 * approved text is ever shared. A link that an export claims for a
 * revision is not one made here and is never handed out.
 */
export async function shareRevision(
  space: LiveSpace,
  revisionId: string,
  deps: ShareDeps,
): Promise<Shared> {
  const find = () => {
    const entry = space.timeline.getState().entries.get(revisionId);
    return entry?.kind === "revision" ? entry : undefined;
  };
  const revision = find();
  if (!revision) return { ok: false, reason: "gone" };
  const known = shareOf(space.timeline.getState(), revisionId);
  if (known)
    return {
      ok: true,
      url: shareUrl(known, deps),
      cid: known.cid,
      key: known.key,
    };
  const shared = await shareScript(space, revision.text, deps);
  // Removed while the link was being made: the link exists, and is
  // returned, but there is no row left to remember it on.
  if (shared.ok && find())
    space.commit({
      entries: [
        {
          kind: "share",
          id: crypto.randomUUID(),
          ts: Date.now(),
          author:
            revision.author.kind === "user"
              ? revision.author
              : { kind: "user" },
          revisionId,
          cid: shared.cid,
          key: shared.key,
        },
      ],
    });
  return shared;
}

/**
 * Pins an encrypted copy of `text`, a text of `space`, and returns its
 * link. Only the approved text is shared: this is the one way a link is
 * made, and the text checked is the text encrypted, before anything is
 * awaited.
 */
export async function shareScript(
  space: Pick<LiveSpace, "markers">,
  text: string,
  deps: ShareDeps,
): Promise<Shared> {
  if (!isReviewed(text, space.markers.getState().approvedText))
    return { ok: false, reason: "unreviewed" };
  // The envelope keeps its `title` for older clients and anything else
  // that reads it; it is always derived from the text.
  const { envelope, key } = await encryptScript({
    title: deriveTitle(text),
    script: text,
  });
  const { IpfsHash } = await deps.pin(envelope, "EVMcrispr - encrypted script");
  return {
    ok: true,
    url: shareUrl({ cid: IpfsHash, key }, deps),
    cid: IpfsHash,
    key,
  };
}
