import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import {
  decryptPayload,
  decryptScript,
  encryptPayload,
  encryptScript,
  fromBase64url,
  isEncryptedEnvelope,
  SHARE_FALLBACK_SCRIPT,
  SHARE_FALLBACK_TITLE,
  SHARE_MIN_VERSION,
  SHARE_SUPPORTED_VERSION,
  SPACE_FALLBACK_SCRIPT,
  SPACE_MIN_VERSION,
  toBase64url,
  unsupportedMinVersion,
} from "../../src";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

async function expectRejection(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (err) {
    expect((err as Error).message).to.include(message);
    return;
  }
  expect.fail("expected promise to reject");
}

const CONTENT = {
  title: "My script — ünïcödé ✨",
  script: 'load token\ntoken:transfer 100e18 @token(DAI) to @me # "quoted"',
};

describe("shareEnvelope", () => {
  it("roundtrips encrypt -> decrypt", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    const decrypted = await decryptScript(envelope, key);
    expect(decrypted).to.deep.equal(CONTENT);
  });

  it("produces a base64url envelope and 43-char key", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    expect(key).to.match(BASE64URL);
    expect(key).to.have.length(43);
    expect(envelope.iv).to.match(BASE64URL);
    expect(envelope.data).to.match(BASE64URL);
    expect(envelope.encrypted).to.equal(true);
    expect(envelope.alg).to.equal("A256GCM");
    expect(envelope.minVersion).to.equal(SHARE_MIN_VERSION);
  });

  it("does not leak plaintext in the envelope", async () => {
    const { envelope } = await encryptScript(CONTENT);
    const json = JSON.stringify(envelope);
    expect(json).to.not.include("token:transfer");
    expect(json).to.not.include(CONTENT.title);
  });

  it("carries fallback title/script for pre-0.11.0 clients", async () => {
    const { envelope } = await encryptScript(CONTENT);
    expect(envelope.title).to.equal(SHARE_FALLBACK_TITLE);
    expect(envelope.script).to.equal(SHARE_FALLBACK_SCRIPT);
  });

  it("uses a fresh key and iv per call", async () => {
    const a = await encryptScript(CONTENT);
    const b = await encryptScript(CONTENT);
    expect(a.key).to.not.equal(b.key);
    expect(a.envelope.iv).to.not.equal(b.envelope.iv);
    expect(a.envelope.data).to.not.equal(b.envelope.data);
  });

  it("rejects a wrong key", async () => {
    const { envelope } = await encryptScript(CONTENT);
    const { key: otherKey } = await encryptScript(CONTENT);
    await expectRejection(
      decryptScript(envelope, otherKey),
      "Invalid decryption key",
    );
  });

  it("rejects malformed and wrong-length keys", async () => {
    const { envelope } = await encryptScript(CONTENT);
    await expectRejection(
      decryptScript(envelope, "!!!not-base64!!!"),
      "Invalid decryption key",
    );
    await expectRejection(
      decryptScript(envelope, "c2hvcnQ"),
      "Invalid decryption key",
    );
  });

  it("rejects tampered ciphertext (GCM auth)", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    const tampered = {
      ...envelope,
      data: `${envelope.data.slice(0, -2)}${envelope.data.endsWith("AA") ? "BB" : "AA"}`,
    };
    await expectRejection(
      decryptScript(tampered, key),
      "Invalid decryption key",
    );
  });

  it("rejects envelopes requiring a newer version", async () => {
    const { envelope, key } = await encryptScript(CONTENT);
    await expectRejection(
      decryptScript({ ...envelope, minVersion: "99.0.0" }, key),
      "newer version",
    );
  });

  it("detects pins requiring a newer version, regardless of shape", async () => {
    const { envelope } = await encryptScript(CONTENT);
    expect(unsupportedMinVersion(envelope)).to.equal(undefined);
    expect(
      unsupportedMinVersion({ ...envelope, minVersion: "99.0.0" }),
    ).to.equal("99.0.0");
    expect(
      unsupportedMinVersion({ minVersion: "99.0.0", unknownFutureField: 1 }),
    ).to.equal("99.0.0");
    expect(unsupportedMinVersion({ minVersion: SHARE_MIN_VERSION })).to.equal(
      undefined,
    );
    expect(unsupportedMinVersion(CONTENT)).to.equal(undefined);
    expect(unsupportedMinVersion(null)).to.equal(undefined);
  });

  it("discriminates envelopes from legacy plaintext pins", async () => {
    const { envelope } = await encryptScript(CONTENT);
    expect(isEncryptedEnvelope(envelope)).to.equal(true);
    expect(isEncryptedEnvelope(CONTENT)).to.equal(false);
    expect(isEncryptedEnvelope(null)).to.equal(false);
    expect(isEncryptedEnvelope("Qm...")).to.equal(false);
  });

  describe("payload kinds", () => {
    const SPACE = {
      kind: "space",
      id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
      title: "T",
      script: "# T\nexec 1",
      timeline: { entries: [], runs: [], removals: [] },
    } as const;

    it("the three versions: shares as before, exports newer, this client reads both", () => {
      expect(SHARE_MIN_VERSION).to.equal("0.11.0");
      expect(SPACE_MIN_VERSION).to.equal("0.12.0");
      expect(SHARE_SUPPORTED_VERSION).to.equal(SPACE_MIN_VERSION);
    });

    it("a script payload round-trips and is stamped as before", async () => {
      const payload = { kind: "script", ...CONTENT } as const;
      const { envelope, key } = await encryptPayload(payload);
      expect(envelope.minVersion).to.equal(SHARE_MIN_VERSION);
      expect(envelope.script).to.equal(SHARE_FALLBACK_SCRIPT);
      expect(await decryptPayload(envelope, key)).to.deep.equal(payload);
    });

    it("an envelope made before payloads had a kind is a script", async () => {
      // What encryptScript wrote up to 0.11: JSON of { title, script }.
      const { envelope, key } = await encryptScript(CONTENT);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        fromBase64url(key),
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
      const data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: fromBase64url(envelope.iv) },
        cryptoKey,
        new TextEncoder().encode(JSON.stringify(CONTENT)),
      );
      const old = { ...envelope, data: toBase64url(new Uint8Array(data)) };
      expect(await decryptPayload(old, key)).to.deep.equal({
        kind: "script",
        ...CONTENT,
      });
    });

    it("encryptScript still writes what a 0.11 client reads: no kind", async () => {
      const { envelope, key } = await encryptScript(CONTENT);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        fromBase64url(key),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64url(envelope.iv) },
        cryptoKey,
        fromBase64url(envelope.data),
      );
      const { title, script } = JSON.parse(new TextDecoder().decode(plain));
      expect({ title, script }).to.deep.equal(CONTENT);
    });

    it("a space payload round-trips and asks for the newer version", async () => {
      const { envelope, key } = await encryptPayload(SPACE);
      expect(envelope.minVersion).to.equal(SPACE_MIN_VERSION);
      expect(envelope.script).to.equal(SPACE_FALLBACK_SCRIPT);
      expect(JSON.stringify(envelope)).to.not.include("exec 1");
      expect(await decryptPayload(envelope, key)).to.deep.equal(SPACE);
      // Anything that only wants the script needs no Yjs.
      expect(await decryptScript(envelope, key)).to.deep.equal({
        title: "T",
        script: "# T\nexec 1",
      });
    });

    it("a space payload missing its id or script is refused", async () => {
      for (const field of ["id", "script"] as const) {
        const { envelope, key } = await encryptPayload({
          ...SPACE,
          [field]: 7,
        } as never);
        await expectRejection(
          decryptPayload(envelope, key),
          "Malformed space export",
        );
      }
    });

    it("an old client reports the version of an export, this one reads it", async () => {
      const { envelope } = await encryptPayload(SPACE);
      // A 0.11 client compares the envelope with its own SHARE_MIN_VERSION
      // before anything else and reports what it finds.
      expect(envelope.minVersion).to.equal("0.12.0");
      expect(unsupportedMinVersion(envelope)).to.equal(undefined);
      expect(unsupportedMinVersion({ minVersion: "0.12.1" })).to.equal(
        "0.12.1",
      );
    });

    it("base64url round-trips bytes", () => {
      const bytes = new Uint8Array([0, 255, 62, 63, 1]);
      expect([...fromBase64url(toBase64url(bytes))]).to.deep.equal([...bytes]);
    });
  });
});
