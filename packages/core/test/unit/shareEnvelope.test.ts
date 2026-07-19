import "../setup";

import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import {
  decryptScript,
  encryptScript,
  isEncryptedEnvelope,
  SHARE_FALLBACK_SCRIPT,
  SHARE_FALLBACK_TITLE,
  SHARE_MIN_VERSION,
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
  script: 'load token\ntoken:transfer @token(DAI) @me 100e18 # "quoted"',
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
});
