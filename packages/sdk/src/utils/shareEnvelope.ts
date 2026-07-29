/**
 * End-to-end-encrypted script sharing envelope.
 *
 * Shared scripts are pinned to IPFS as an AES-256-GCM envelope; the symmetric
 * key travels only in the share link's URL fragment (`#/<cid>#<key>`), so it
 * never reaches any server. Uses `globalThis.crypto.subtle`, available in
 * browsers (secure contexts), Node >= 20 and Bun without imports.
 */

export const SHARE_MIN_VERSION = "0.11.0";

export interface ShareableScript {
  title: string;
  script: string;
}

/**
 * Plaintext fallback fields baked into every envelope so pre-0.11.0 clients
 * (which read `{title, script}` directly) show a hint instead of an empty
 * script.
 */
export const SHARE_FALLBACK_TITLE = "Encrypted script";
export const SHARE_FALLBACK_SCRIPT = "Use v0.11.0 or above to decrypt the link";

export interface EncryptedScriptEnvelope {
  /** Fallback shown by pre-0.11.0 clients; not the real title. */
  title: string;
  /** Fallback shown by pre-0.11.0 clients; not the real script. */
  script: string;
  encrypted: true;
  /** Minimum evmcrispr version able to read this envelope format. */
  minVersion: string;
  alg: "A256GCM";
  /** base64url, 12 random bytes */
  iv: string;
  /** base64url AES-256-GCM ciphertext of JSON({title, script}) */
  data: string;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isEncryptedEnvelope(x: unknown): x is EncryptedScriptEnvelope {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as EncryptedScriptEnvelope).encrypted === true &&
    typeof (x as EncryptedScriptEnvelope).iv === "string" &&
    typeof (x as EncryptedScriptEnvelope).data === "string"
  );
}

function isNewerVersion(version: string, than: string): boolean {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Returns the pin's declared `minVersion` when it is newer than what this
 * client supports (i.e. the pin uses a future share format), else undefined.
 * Works on any fetched pin shape, not just recognized envelopes.
 */
export function unsupportedMinVersion(x: unknown): string | undefined {
  if (typeof x !== "object" || x === null) return undefined;
  const minVersion = (x as { minVersion?: unknown }).minVersion;
  if (typeof minVersion !== "string") return undefined;
  return isNewerVersion(minVersion, SHARE_MIN_VERSION) ? minVersion : undefined;
}

export async function encryptScript(
  content: ShareableScript,
): Promise<{ envelope: EncryptedScriptEnvelope; key: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ title: content.title, script: content.script }),
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext,
  );
  const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);

  return {
    envelope: {
      title: SHARE_FALLBACK_TITLE,
      script: SHARE_FALLBACK_SCRIPT,
      encrypted: true,
      minVersion: SHARE_MIN_VERSION,
      alg: "A256GCM",
      iv: toBase64url(iv),
      data: toBase64url(new Uint8Array(ciphertext)),
    },
    key: toBase64url(new Uint8Array(rawKey)),
  };
}

export async function decryptScript(
  envelope: EncryptedScriptEnvelope,
  key: string,
): Promise<ShareableScript> {
  if (isNewerVersion(envelope.minVersion, SHARE_MIN_VERSION)) {
    throw new Error(
      `This script requires a newer version of EVMcrispr (>= ${envelope.minVersion})`,
    );
  }

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = fromBase64url(key);
  } catch {
    throw new Error("Invalid decryption key");
  }
  if (keyBytes.length !== 32) {
    throw new Error("Invalid decryption key");
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64url(envelope.iv) },
      cryptoKey,
      fromBase64url(envelope.data),
    );
    const { title, script } = JSON.parse(new TextDecoder().decode(plaintext));
    return { title: String(title ?? ""), script: String(script ?? "") };
  } catch {
    throw new Error("Invalid decryption key");
  }
}
