import { ErrorException } from "../errors";

/**
 * Normalize content fetched from IPFS into EVML module source text.
 *
 * Accepted shapes:
 * - plain EVML text
 * - a JSON-quoted string (the `@ipfs` helper / Pinata `pinJSONToIPFS`
 *   convention wraps text content in JSON quotes)
 * - an unencrypted share pin `{ title?, script }` → the `script` field
 *
 * Encrypted share envelopes (`encrypted: true`) are rejected with a
 * targeted error — share links are not module files.
 */
export function normalizeModuleSource(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"') && !trimmed.startsWith("{")) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return raw;
  }

  if (typeof parsed === "string") return parsed;

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.encrypted === true) {
      throw new ErrorException(
        "this CID is an encrypted share link, not a module file — publish the module as plain text",
      );
    }
    if (typeof obj.script === "string") return obj.script;
  }

  return raw;
}
