import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  decryptScript,
  isEncryptedEnvelope,
  singleBlockCid,
} from "@evmcrispr/core";
import { createLink } from "../../src/tools/create-link.js";

const ARGS = {
  title: "Treasury payout",
  script: "load token\ntoken:transfer 100e18 DAI to @me",
};

const originalFetch = globalThis.fetch;
const originalJwt = process.env.VITE_PINATA_JWT;

let pinnedUrl: string | undefined;
let pinnedHeaders: Headers;
let pinnedBody: any;
/** The address of what was pinned: the client refuses any other. */
let pinnedCid: string;

beforeEach(() => {
  process.env.VITE_PINATA_JWT = "test-jwt";
  pinnedBody = undefined;
  globalThis.fetch = mock(async (url: any, init: any) => {
    pinnedUrl = String(url);
    pinnedHeaders = new Headers(init.headers);
    pinnedBody = JSON.parse(init.body);
    pinnedCid = (await singleBlockCid(
      new TextEncoder().encode(JSON.stringify(pinnedBody.pinataContent)),
    )) as string;
    // Pinata answers `IpfsHash`, the EVMcrispr API `cid`.
    return Response.json(
      pinnedUrl.includes("pinata")
        ? { IpfsHash: pinnedCid }
        : { cid: pinnedCid },
    );
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
      new RegExp(
        `^https://next\\.evmcrispr\\.com/#/${pinnedCid}#[A-Za-z0-9_-]{43}$`,
      ),
    );
    expect(result.cid).toBe(pinnedCid);
    expect(result.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces a decryptable envelope with the returned key", async () => {
    const result = await createLink(ARGS);

    const keyFromUrl = result.url!.split("#").pop()!;
    expect(keyFromUrl).toBe(result.key!);

    const decrypted = await decryptScript(pinnedBody.pinataContent, keyFromUrl);
    expect(decrypted).toEqual(ARGS);
  });

  it("pins straight to Pinata with a token of its own", async () => {
    await createLink(ARGS);
    expect(pinnedUrl).toBe("https://api.pinata.cloud/pinning/pinJSONToIPFS");
    expect(pinnedHeaders.get("Authorization")).toBe("Bearer test-jwt");
  });

  it("pins through the EVMcrispr API without a token", async () => {
    delete process.env.VITE_PINATA_JWT;
    const result = await createLink(ARGS);

    expect(result.success).toBe(true);
    expect(result.cid).toBe(pinnedCid);
    expect(pinnedUrl).toBe("https://api.evmcrispr.com/ipfs/pin");
    expect(pinnedHeaders.get("Authorization")).toBeNull();
    expect(isEncryptedEnvelope(pinnedBody.pinataContent)).toBe(true);
  });

  it("refuses a link to anything but the envelope it pinned", async () => {
    globalThis.fetch = mock(async () =>
      // The address of some other content.
      Response.json({ cid: "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o" }),
    ) as unknown as typeof fetch;
    const result = await createLink(ARGS);
    expect(result.success).toBe(false);
    expect(result.url).toBeUndefined();
    expect(result.error).toInclude("does not match the content");
  });

  it("reports a refused pin", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        { error: "too many pins; try again later" },
        { status: 429 },
      ),
    ) as unknown as typeof fetch;
    const result = await createLink(ARGS);
    expect(result.success).toBe(false);
    expect(result.error).toInclude("too many pins");
  });
});
