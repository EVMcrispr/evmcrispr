import { ErrorException } from "../errors";
import { decryptScript, isEncryptedEnvelope } from "./shareEnvelope";

/**
 * Resolve content fetched from IPFS into EVML module source text.
 *
 * Accepted shapes:
 * - plain EVML text (returned verbatim)
 * - an unencrypted share pin `{ title?, script }` → the `script` field
 * - an encrypted share envelope, when `decryptionKey` (the base64url key
 *   from the share link fragment) is provided → the decrypted `script`
 *
 * Encrypted envelopes without a key are rejected with a targeted error.
 */
export async function resolveModuleSource(
  raw: string,
  opts?: { decryptionKey?: string },
): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return raw;
  }

  if (parsed && typeof parsed === "object") {
    if (isEncryptedEnvelope(parsed)) {
      if (opts?.decryptionKey) {
        return (await decryptScript(parsed, opts.decryptionKey)).script;
      }
      throw new ErrorException(
        'this CID is an encrypted share link — append its key to load it: --from "ipfs://<cid>#<key>"',
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.script === "string") return obj.script;
  }

  return raw;
}
