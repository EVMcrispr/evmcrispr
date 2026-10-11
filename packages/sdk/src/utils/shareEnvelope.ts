/**
 * End-to-end-encrypted sharing envelope.
 *
 * What is shared is pinned to IPFS as an AES-256-GCM envelope; the symmetric
 * key travels only in the link's URL fragment (`#/<cid>#<key>`), so it
 * never reaches any server. Uses `globalThis.crypto.subtle`, available in
 * browsers (secure contexts), Node >= 20 and Bun without imports.
 *
 * The envelope carries one of two payloads: a script (a share), or a whole
 * space (an export): its id, its current script and its timeline records.
 * The script sits where a share has it, so anything that only wants the
 * script reads both the same way.
 */

/** Stamped on script shares: the oldest client that reads them. */
export const SHARE_MIN_VERSION = "0.11.0";
/** Stamped on space exports: the release that introduced them. */
export const SPACE_MIN_VERSION = "0.12.0";
/** The newest envelope format this client reads. */
export const SHARE_SUPPORTED_VERSION = SPACE_MIN_VERSION;

export interface ShareableScript {
  title: string;
  script: string;
}

export type SharePayload =
  | ({ kind: "script" } & ShareableScript)
  | ({
      kind: "space";
      id: string;
      /** The timeline records, as JSON. Opaque here: whoever restores
       *  the space checks them. */
      timeline: unknown;
    } & ShareableScript);

/**
 * Plaintext fallback fields baked into every envelope so pre-0.11.0 clients
 * (which read `{title, script}` directly) show a hint instead of an empty
 * script.
 */
export const SHARE_FALLBACK_TITLE = "Encrypted script";
export const SHARE_FALLBACK_SCRIPT = "Use v0.11.0 or above to decrypt the link";
export const SPACE_FALLBACK_SCRIPT = `Use v${SPACE_MIN_VERSION} or above to open this space`;

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
  /** base64url AES-256-GCM ciphertext of the JSON of a `SharePayload` */
  data: string;
}

export function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
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
  return isNewerVersion(minVersion, SHARE_SUPPORTED_VERSION)
    ? minVersion
    : undefined;
}

export async function encryptPayload(
  payload: SharePayload,
): Promise<{ envelope: EncryptedScriptEnvelope; key: string }> {
  const space = payload.kind === "space";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const rawKey = await crypto.subtle.exportKey("raw", cryptoKey);

  return {
    envelope: {
      title: SHARE_FALLBACK_TITLE,
      script: space ? SPACE_FALLBACK_SCRIPT : SHARE_FALLBACK_SCRIPT,
      encrypted: true,
      minVersion: space ? SPACE_MIN_VERSION : SHARE_MIN_VERSION,
      alg: "A256GCM",
      iv: toBase64url(iv),
      data: toBase64url(new Uint8Array(ciphertext)),
    },
    key: toBase64url(new Uint8Array(rawKey)),
  };
}

/**
 * Decrypts an envelope into its payload. A payload with no `kind` (every
 * share made before 0.12) is a script. Only the shape is checked here: a
 * space's script and timeline come from whoever made the link, and the
 * host that restores them validates both.
 */
export async function decryptPayload(
  envelope: EncryptedScriptEnvelope,
  key: string,
): Promise<SharePayload> {
  if (isNewerVersion(envelope.minVersion, SHARE_SUPPORTED_VERSION)) {
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

  let parsed: Record<string, unknown>;
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
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Invalid decryption key");
  }

  if (parsed?.kind !== "space")
    return {
      kind: "script",
      title: String(parsed?.title ?? ""),
      script: String(parsed?.script ?? ""),
    };
  const { id, title, script, timeline } = parsed;
  if (typeof id !== "string" || typeof script !== "string")
    throw new Error("Malformed space export");
  return {
    kind: "space",
    id,
    title: typeof title === "string" ? title : "",
    script,
    timeline,
  };
}

/** Encrypts a script to share. */
export function encryptScript(
  content: ShareableScript,
): Promise<{ envelope: EncryptedScriptEnvelope; key: string }> {
  return encryptPayload({
    kind: "script",
    title: content.title,
    script: content.script,
  });
}

/** The script an envelope holds: a shared script, or the current script
 *  of an exported space. */
export async function decryptScript(
  envelope: EncryptedScriptEnvelope,
  key: string,
): Promise<ShareableScript> {
  const { title, script } = await decryptPayload(envelope, key);
  return { title, script };
}
