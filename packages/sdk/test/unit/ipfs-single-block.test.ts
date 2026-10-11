import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { IPFS_GATEWAY, IPFSResolver } from "../../src/IPFSResolver";
import {
  matchesSingleBlock,
  primeIpfsContent,
  resetGatewayCapabilities,
  resetPrimedIpfsContent,
  SINGLE_BLOCK_LIMIT,
  TRUSTLESS_GATEWAYS,
  verifiedEvmlFetch,
  verifiedIpfsEntity,
  verifiedIpfsFetch,
} from "../../src/utils/verifiedIpfs";

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return digits
    .reverse()
    .map((d) => B58[d])
    .join("");
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

/** The dag-pb block a default `ipfs add` makes for a one-chunk file. */
function fileBlock(content: Uint8Array): Uint8Array {
  const unixfs = [
    0x08,
    0x02,
    ...(content.length ? [0x12, ...varint(content.length), ...content] : []),
    0x18,
    ...varint(content.length),
  ];
  return Uint8Array.from([0x0a, ...varint(unixfs.length), ...unixfs]);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer),
  );
}

async function cidV0Of(content: Uint8Array) {
  const block = fileBlock(content);
  const bytes = Uint8Array.from([0x12, 0x20, ...(await sha256(block))]);
  return { str: base58Encode(bytes), bytes, block };
}

// Addresses anyone can reproduce with `ipfs add` (defaults) and
// `ipfs add --cid-version 1 --raw-leaves`.
const HELLO_NEWLINE = "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o";
const EMPTY = "QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH";
const HELLO_RAW = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e";

const REAL_SHARE = "QmdSHYDUDeSP3offUVt7xRgdcrQbQKPwmxfX2vNqjX6AQk";
const REAL_SHARE_BASE64 =
  "eyJ0aXRsZSI6IkJsb2NrU3BsaXQgQWN0IDAg4oCUIEhlbGxvLCBibG9ja2NoYWluIiwic2NyaXB0IjoiIyBBQ1QgMCDigJQgVGhlIGJsb2NrY2hhaW4gaXMgYSBkYXRhYmFzZSB5b3UgY2FuIGp1c3QgYXNrXG5sb2FkIGVuc1xuXG5zZXQgJG9wZXJhdG9yIEBlbnMoXCJzZW0tdGhlLWJlZS5ldGhcIilcblxucHJpbnQgXCJvcGVyYXRvcjpcIiAkb3BlcmF0b3JcbnByaW50IFwicHJpbWFyeSBuYW1lOlwiIEBlbnMubmFtZSgkb3BlcmF0b3IpXG5wcmludCBcIkVUSCBiYWxhbmNlOlwiIEB0b2tlbi5mb3JtYXQoRVRIIEB0b2tlbi5iYWxhbmNlKEVUSCAkb3BlcmF0b3IpKSBcIkVUSFwiIn0=";

describe("matchesSingleBlock", () => {
  it("matches a CIDv0 file against its UnixFS wrapper", async () => {
    expect(await matchesSingleBlock(HELLO_NEWLINE, text("hello world\n"))).toBe(
      true,
    );
  });

  it("matches the empty file", async () => {
    expect(await matchesSingleBlock(EMPTY, new Uint8Array())).toBe(true);
  });

  it("matches a CIDv1 raw block by hashing the bytes", async () => {
    expect(await matchesSingleBlock(HELLO_RAW, text("hello world"))).toBe(true);
  });

  it("matches a CIDv1 dag-pb address the same way as CIDv0", async () => {
    const digest = await sha256(fileBlock(text("hello world\n")));
    const v1 = `b${base32Encode(Uint8Array.from([0x01, 0x70, 0x12, 0x20, ...digest]))}`;
    expect(await matchesSingleBlock(v1, text("hello world\n"))).toBe(true);
    expect(await matchesSingleBlock(v1, text("hello world"))).toBe(false);
  });

  it("matches an identity address against the bytes themselves", async () => {
    const hi = `b${base32Encode(Uint8Array.from([0x01, 0x55, 0x00, 0x02, ...text("hi")]))}`;
    expect(await matchesSingleBlock(hi, text("hi"))).toBe(true);
    expect(await matchesSingleBlock(hi, text("ho"))).toBe(false);
  });

  it("matches a real shared script, as pinJSONToIPFS stored it", async () => {
    // Recorded from the gateway: Pinata pins the JSON compact, in one block.
    const share = Uint8Array.from(atob(REAL_SHARE_BASE64), (c) =>
      c.charCodeAt(0),
    );
    expect(await matchesSingleBlock(REAL_SHARE, share)).toBe(true);
    expect(decode(share)).toBe(JSON.stringify(JSON.parse(decode(share))));
  });

  it("refuses bytes that differ", async () => {
    expect(await matchesSingleBlock(HELLO_NEWLINE, text("hello world"))).toBe(
      false,
    );
    expect(await matchesSingleBlock(HELLO_RAW, text("hello world\n"))).toBe(
      false,
    );
  });

  it("refuses anything over the single-block limit", async () => {
    const content = new Uint8Array(SINGLE_BLOCK_LIMIT + 1);
    const cid = await cidV0Of(content);
    expect(await matchesSingleBlock(cid.str, content)).toBe(false);
  });

  it("refuses a hash function it cannot compute", async () => {
    // sha2-512 over a raw block.
    const cid = `b${base32Encode(Uint8Array.from([0x01, 0x55, 0x13, 0x40, ...new Uint8Array(64)]))}`;
    expect(await matchesSingleBlock(cid, text("anything"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The fetch path. Fixtures here are plain files, as a gateway serves them.
// ---------------------------------------------------------------------------

/** A one-block CAR, as a trustless gateway serves it. */
function carOf(cid: { bytes: Uint8Array; block: Uint8Array }): Response {
  const body = Uint8Array.from([
    1,
    0xa0,
    ...varint(cid.bytes.length + cid.block.length),
    ...cid.bytes,
    ...cid.block,
  ]);
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/vnd.ipld.car; version=1" },
  });
}

const plain = (body: Uint8Array) =>
  new Response(body as unknown as BodyInit, { status: 200 });

describe("verified fetch of a single-block file", () => {
  const realFetch = globalThis.fetch;
  const realTrust = IPFSResolver.trustGateway;
  let requestedUrls: string[];

  beforeEach(() => {
    IPFSResolver.trustGateway = false;
    requestedUrls = [];
    resetGatewayCapabilities();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    IPFSResolver.trustGateway = realTrust;
    resetGatewayCapabilities();
  });

  const route = (reply: (href: string) => Response | Promise<Response>) => {
    globalThis.fetch = (async (url: string | URL) => {
      const href = String(url);
      requestedUrls.push(href);
      return reply(href);
    }) as any;
  };
  const isCar = (href: string) => href.includes("format=car");

  it("opens a shared script in one request to the plain gateway", async () => {
    // The shape of a share envelope, as `pinJSONToIPFS` stores one.
    const envelope = text(
      '{"v":1,"alg":"A256GCM","iv":"q83vEjRWeJCrze8S","ct":"3q2+7w=="}',
    );
    const cid = await cidV0Of(envelope);
    route(() => plain(envelope));

    expect(await new IPFSResolver().text(cid.str)).toBe(decode(envelope));
    expect(requestedUrls).toEqual([`${IPFS_GATEWAY}${cid.str}`]);
  });

  it("never returns tampered bytes: the CAR path settles it", async () => {
    const cid = await cidV0Of(text("honest script"));
    route((href) => (isCar(href) ? carOf(cid) : plain(text("evil script"))));

    expect(decode(await verifiedIpfsFetch(cid.str, "https://gw/ipfs/"))).toBe(
      "honest script",
    );
    expect(requestedUrls[0]).toBe(`https://gw/ipfs/${cid.str}`);
    expect(isCar(requestedUrls[1])).toBe(true);
  });

  it("fails when neither the plain bytes nor any CAR verify", async () => {
    const cid = await cidV0Of(text("honest script"));
    route(() => plain(text("evil script")));

    await expect(
      verifiedIpfsFetch(cid.str, "https://gw/ipfs/"),
    ).rejects.toThrow(/IPFS verification failed/);
  });

  it("matches a file of exactly the limit", async () => {
    const content = new Uint8Array(SINGLE_BLOCK_LIMIT).fill(7);
    const cid = await cidV0Of(content);
    route(() => plain(content));

    const bytes = await verifiedIpfsFetch(cid.str, "https://gw/ipfs/");
    expect(bytes.length).toBe(SINGLE_BLOCK_LIMIT);
    expect(requestedUrls).toHaveLength(1);
  });

  it("skips a larger file on its declared size without reading it", async () => {
    const cid = await cidV0Of(text("small after all"));
    let bodyRead = false;
    route((href) => {
      if (isCar(href)) return carOf(cid);
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            bodyRead = true;
            controller.enqueue(new Uint8Array(1024));
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, {
        status: 200,
        headers: { "Content-Length": String(SINGLE_BLOCK_LIMIT + 1) },
      });
    });

    expect(decode(await verifiedIpfsFetch(cid.str, "https://gw/ipfs/"))).toBe(
      "small after all",
    );
    expect(bodyRead).toBe(false);
  });

  it("stops reading a body that outgrows the limit", async () => {
    const cid = await cidV0Of(text("small after all"));
    let served = 0;
    let cancelled = false;
    route((href) => {
      if (isCar(href)) return carOf(cid);
      // No Content-Length, and no end: only cancelling stops it.
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            served += 64 * 1024;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, { status: 200 });
    });

    expect(decode(await verifiedIpfsFetch(cid.str, "https://gw/ipfs/"))).toBe(
      "small after all",
    );
    expect(cancelled).toBe(true);
    expect(served).toBeLessThanOrEqual(SINGLE_BLOCK_LIMIT + 2 * 64 * 1024);
  });

  it("retries the plain request on Pinata when the gateway fails outright", async () => {
    const content = text("pinned script");
    const cid = await cidV0Of(content);
    route((href) =>
      href.startsWith("https://gw/")
        ? new Response(null, { status: 504, statusText: "Gateway Timeout" })
        : plain(content),
    );

    expect(decode(await verifiedIpfsFetch(cid.str, "https://gw/ipfs/"))).toBe(
      "pinned script",
    );
    expect(requestedUrls).toEqual([
      `https://gw/ipfs/${cid.str}`,
      `${TRUSTLESS_GATEWAYS[0]}${cid.str}`,
    ]);
  });

  it("never takes the plain step for a path inside an address", async () => {
    const cid = await cidV0Of(text("whatever"));
    route(() => new Response(null, { status: 504 }));

    await expect(
      verifiedIpfsFetch(`${cid.str}/file.txt`, "https://gw/ipfs/"),
    ).rejects.toThrow();
    expect(requestedUrls.length).toBeGreaterThan(0);
    expect(requestedUrls.every(isCar)).toBe(true);
  });

  it("never returns a directory's plain listing", async () => {
    // An empty UnixFS directory; a gateway answers its address with HTML.
    const block = Uint8Array.from([0x0a, 0x02, 0x08, 0x01]);
    const bytes = Uint8Array.from([0x12, 0x20, ...(await sha256(block))]);
    const dir = { str: base58Encode(bytes), bytes, block };
    route((href) =>
      isCar(href) ? carOf(dir) : plain(text("<html>Index of /ipfs</html>")),
    );

    const entity = await verifiedIpfsEntity(dir.str, "https://gw/ipfs/", {
      maxBytes: 16,
    });
    expect(entity).toEqual({ kind: "directory", entries: [] });
  });

  it("previews a small file from its plain bytes, then truncates", async () => {
    const content = text("a preview of a small pinned file");
    const cid = await cidV0Of(content);
    route(() => plain(content));

    const entity = await verifiedIpfsEntity(cid.str, "https://gw/ipfs/", {
      maxBytes: 9,
    });
    if (entity.kind !== "file") throw new Error("unreachable");
    expect(decode(entity.bytes)).toBe("a preview");
    expect(entity.size).toBe(content.length);
    expect(entity.complete).toBe(false);
    expect(requestedUrls).toEqual([`https://gw/ipfs/${cid.str}`]);
  });

  it("probes what an address is (maxBytes 0) without fetching the file", async () => {
    const cid = await cidV0Of(text("a child of a previewed folder"));
    route((href) => (isCar(href) ? carOf(cid) : plain(text("unused"))));

    const entity = await verifiedIpfsEntity(cid.str, "https://gw/ipfs/", {
      maxBytes: 0,
    });
    expect(entity.kind).toBe("file");
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("entity-bytes=0:0");
  });

  it("asks the default gateway for the plain file only, never for a CAR", async () => {
    // A directory: the plain listing settles nothing, and the default
    // gateway is known not to serve CARs, so the next request is Pinata's.
    const block = Uint8Array.from([0x0a, 0x02, 0x08, 0x01]);
    const bytes = Uint8Array.from([0x12, 0x20, ...(await sha256(block))]);
    const dir = { str: base58Encode(bytes), bytes, block };
    route((href) => (isCar(href) ? carOf(dir) : plain(text("<html></html>"))));

    await verifiedIpfsEntity(dir.str, IPFS_GATEWAY);
    expect(requestedUrls).toEqual([
      `${IPFS_GATEWAY}${dir.str}`,
      `${TRUSTLESS_GATEWAYS[0]}${dir.str}?format=car&dag-scope=entity`,
    ]);
  });

  it("gives up on a gateway that does not answer the plain request in time", async () => {
    const content = text("pinned script");
    const cid = await cidV0Of(content);
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      requestedUrls.push(href);
      if (!href.startsWith("https://gw/")) return plain(content);
      // Stalls until its request is aborted, as a real fetch would.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as any;

    const bytes = await verifiedIpfsFetch(cid.str, "https://gw/ipfs/", {
      plainTimeoutMs: 20,
    });
    expect(decode(bytes)).toBe("pinned script");
    expect(requestedUrls).toEqual([
      `https://gw/ipfs/${cid.str}`,
      `${TRUSTLESS_GATEWAYS[0]}${cid.str}`,
    ]);
  });

  it("honours an abort instead of trying further gateways", async () => {
    const cid = await cidV0Of(text("never arrives"));
    const controller = new AbortController();
    route(() => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(
      verifiedIpfsFetch(cid.str, "https://gw/ipfs/", {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(requestedUrls).toHaveLength(1);
  });
});

// Shared scripts and module files are pinned as one block, so they are only
// ever fetched one way: the plain file from the gateway, checked against
// its CID. No CAR, no second gateway.
describe("IPFSResolver.evml", () => {
  const realFetch = globalThis.fetch;
  const realTrust = IPFSResolver.trustGateway;
  let requestedUrls: string[];

  beforeEach(() => {
    IPFSResolver.trustGateway = false;
    requestedUrls = [];
    resetGatewayCapabilities();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    IPFSResolver.trustGateway = realTrust;
    resetGatewayCapabilities();
  });

  const route = (reply: (href: string) => Response | Promise<Response>) => {
    globalThis.fetch = (async (url: string | URL) => {
      const href = String(url);
      requestedUrls.push(href);
      return reply(href);
    }) as any;
  };

  it("fetches the plain file from the default gateway and verifies it", async () => {
    const script = text('{"title":"t","script":"print @me"}');
    const cid = await cidV0Of(script);
    route(() => plain(script));

    expect(await new IPFSResolver().evml(cid.str)).toBe(decode(script));
    expect(requestedUrls).toEqual([`${IPFS_GATEWAY}${cid.str}`]);
  });

  it("fetches a CID once, however often it is asked for", async () => {
    const script = text("def module m (\n)");
    const cid = await cidV0Of(script);
    route(() => plain(script));

    const resolver = new IPFSResolver();
    await resolver.evml(cid.str);
    await resolver.evml(cid.str);
    expect(requestedUrls).toHaveLength(1);
  });

  it("refuses bytes that are not the file, and asks nobody else", async () => {
    const cid = await cidV0Of(text("honest script"));
    // Every later request would be answered with the real thing.
    route(() =>
      requestedUrls.length === 1 ? plain(text("evil script")) : carOf(cid),
    );

    await expect(new IPFSResolver().evml(cid.str)).rejects.toThrow(
      /IPFS verification failed/,
    );
    expect(requestedUrls).toEqual([`${IPFS_GATEWAY}${cid.str}`]);
  });

  it("refuses a file over 256 KiB without reading it", async () => {
    const cid = await cidV0Of(text("whatever"));
    let bodyRead = false;
    route(() => {
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            bodyRead = true;
            controller.enqueue(new Uint8Array(1024));
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, {
        status: 200,
        headers: { "Content-Length": String(SINGLE_BLOCK_LIMIT + 1) },
      });
    });

    await expect(new IPFSResolver().evml(cid.str)).rejects.toThrow(/256 KB/);
    expect(bodyRead).toBe(false);
    expect(requestedUrls).toHaveLength(1);
  });

  it("reports a gateway that does not have it, without trying another", async () => {
    const cid = await cidV0Of(text("missing"));
    route(() => new Response(null, { status: 504, statusText: "Timeout" }));

    await expect(new IPFSResolver().evml(cid.str)).rejects.toThrow(/504/);
    expect(requestedUrls).toHaveLength(1);
  });

  it("gives up on a gateway that never answers", async () => {
    const cid = await cidV0Of(text("slow"));
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      requestedUrls.push(String(url));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as any;

    await expect(
      verifiedEvmlFetch(cid.str, IPFS_GATEWAY, { plainTimeoutMs: 20 }),
    ).rejects.toThrow(/Couldn't fetch/);
    expect(requestedUrls).toHaveLength(1);
  });

  it("only takes a bare CID", async () => {
    const cid = await cidV0Of(text("whatever"));
    route(() => plain(text("whatever")));

    await expect(
      new IPFSResolver().evml(`${cid.str}/module.evml`),
    ).rejects.toThrow(/bare CID/);
    await expect(new IPFSResolver().evml("not-a-cid")).rejects.toThrow(
      /not a supported CID/,
    );
    expect(requestedUrls).toHaveLength(0);
  });

  it("serves what this session pinned without a request", async () => {
    const script = text("def module mine (\n)");
    const cid = await cidV0Of(script);
    primeIpfsContent(cid.str, script);
    route(() => new Response(null, { status: 504 }));

    expect(await new IPFSResolver().evml(cid.str)).toBe(decode(script));
    expect(requestedUrls).toHaveLength(0);
    resetPrimedIpfsContent();
  });
});
