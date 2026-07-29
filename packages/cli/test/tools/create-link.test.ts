import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { decryptScript, isEncryptedEnvelope } from "@evmcrispr/core";
import { createLink } from "../../src/tools/create-link.js";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const ARGS = {
  title: "Treasury payout",
  script: "load token\ntoken:transfer 100e18 DAI to @me",
};

const originalFetch = globalThis.fetch;
const originalJwt = process.env.VITE_PINATA_JWT;

let pinnedBody: any;

beforeEach(() => {
  process.env.VITE_PINATA_JWT = "test-jwt";
  pinnedBody = undefined;
  globalThis.fetch = mock(async (_url: any, init: any) => {
    pinnedBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ IpfsHash: CID }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.VITE_PINATA_JWT = originalJwt;
});

describe("createLink", () => {
  it("pins an encrypted envelope with no plaintext leakage", async () => {
    const result = await createLink(ARGS);

    expect(result.success).toBe(true);
    expect(isEncryptedEnvelope(pinnedBody.pinataContent)).toBe(true);
    // Fallback fields keep old clients functional (they read {title, script})
    expect(pinnedBody.pinataContent.title).toBe("Encrypted script");
    expect(pinnedBody.pinataContent.script).toBe(
      "Use v0.11.0 or above to decrypt the link",
    );
    expect(pinnedBody.pinataMetadata.name).toBe("EVMcrispr - encrypted script");
    expect(pinnedBody.pinataMetadata.keyvalues.version).toBe("0.11");

    const rawBody = JSON.stringify(pinnedBody);
    expect(rawBody).not.toInclude(ARGS.script);
    expect(rawBody).not.toInclude(ARGS.title);
  });

  it("returns a link with the key as the last fragment segment", async () => {
    const result = await createLink(ARGS);

    expect(result.url).toMatch(
      new RegExp(`^https://next\\.evmcrispr\\.com/#/${CID}#[A-Za-z0-9_-]{43}$`),
    );
    expect(result.cid).toBe(CID);
    expect(result.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces a decryptable envelope with the returned key", async () => {
    const result = await createLink(ARGS);

    const keyFromUrl = result.url!.split("#").pop()!;
    expect(keyFromUrl).toBe(result.key!);

    const decrypted = await decryptScript(pinnedBody.pinataContent, keyFromUrl);
    expect(decrypted).toEqual(ARGS);
  });

  it("fails without VITE_PINATA_JWT", async () => {
    delete process.env.VITE_PINATA_JWT;
    const result = await createLink(ARGS);
    expect(result.success).toBe(false);
    expect(result.error).toInclude("VITE_PINATA_JWT");
  });
});
