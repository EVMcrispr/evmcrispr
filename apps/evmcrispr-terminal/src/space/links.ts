import {
  decryptScript,
  encryptScript,
  isEncryptedEnvelope,
  unsupportedMinVersion,
} from "@evmcrispr/core";
import { deriveTitle, isReviewed } from "@evmcrispr/space";
import { cid } from "is-ipfs";
import type { LiveSpace } from "./live-space";

export function isCID(s: string | undefined): s is string {
  return !!s && !!cid(s);
}

export type EncryptedReason = "missing-key" | "invalid-key" | "needs-upgrade";

export type SharedScript =
  | { status: "found"; title: string; script: string; encrypted: boolean }
  | { status: "error" }
  | { status: "encrypted"; reason: EncryptedReason; requiredVersion?: string };

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
    if (!key) return { status: "encrypted", reason: "missing-key" };
    try {
      return {
        status: "found",
        ...(await decryptScript(data, key)),
        encrypted: true,
      };
    } catch {
      return { status: "encrypted", reason: "invalid-key" };
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
  | { ok: false; reason: "unreviewed" };

/**
 * Pins an encrypted copy of `text`, a text of `space`, and returns its
 * link. Only the approved text is shared: this is the one way a link is
 * made, and the text checked is the text encrypted, before anything is
 * awaited. The key travels only in the link's fragment and must stay its
 * LAST segment: react-router splits the fragment on `#` before `?`.
 */
export async function shareScript(
  space: Pick<LiveSpace, "markers">,
  text: string,
  deps: {
    pin(envelope: unknown, name: string): Promise<{ IpfsHash: string }>;
    origin: string;
    viewMode: "edit" | "view";
  },
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
  const mode = deps.viewMode === "view" ? "?mode=view" : "";
  return {
    ok: true,
    url: `${deps.origin}/#/${IpfsHash}${mode}#${key}`,
    cid: IpfsHash,
    key,
  };
}
