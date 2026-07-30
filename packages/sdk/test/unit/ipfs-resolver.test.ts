import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { IPFSResolver } from "../../src/IPFSResolver";
import { verifiedIpfsEntity } from "../../src/utils/verifiedIpfs";

// ---------------------------------------------------------------------------
// Fixture builders: just enough varint/base58/base32/dag-pb/UnixFS/CAR
// *encoding* to craft verifiable gateway responses for the decoder under test.
// ---------------------------------------------------------------------------

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

function cat(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer),
  );
}

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

/** CIDv1 with the raw codec: the block bytes ARE the file content. */
async function cidV1Raw(
  block: Uint8Array,
): Promise<{ str: string; bytes: Uint8Array }> {
  const bytes = cat([0x01, 0x55, 0x12, 0x20], await sha256(block));
  return { str: `b${base32Encode(bytes)}`, bytes };
}

/** CIDv0 (Qm…): a bare sha2-256 multihash of a dag-pb block. */
async function cidV0(
  block: Uint8Array,
): Promise<{ str: string; bytes: Uint8Array }> {
  const bytes = cat([0x12, 0x20], await sha256(block));
  return { str: base58Encode(bytes), bytes };
}

function pbLink(cidBytes: Uint8Array, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  return cat(
    [0x0a],
    varint(cidBytes.length),
    cidBytes, // Hash (1)
    [0x12],
    varint(nameBytes.length),
    nameBytes, // Name (2)
    [0x18],
    varint(0), // Tsize (3)
  );
}

function pbNode(opts: { data?: Uint8Array; links?: Uint8Array[] }): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const link of opts.links ?? []) {
    parts.push(cat([0x12], varint(link.length), link)); // Links (2)
  }
  if (opts.data) parts.push(cat([0x0a], varint(opts.data.length), opts.data)); // Data (1)
  return cat(...parts);
}

function unixfs(
  type: number,
  data?: Uint8Array,
  filesize?: number,
): Uint8Array {
  const parts: Uint8Array[] = [cat([0x08], varint(type))]; // Type (1)
  if (data) parts.push(cat([0x12], varint(data.length), data)); // Data (2)
  if (filesize !== undefined) parts.push(cat([0x18], varint(filesize))); // filesize (3)
  return cat(...parts);
}

function car(blocks: { cid: Uint8Array; data: Uint8Array }[]): Uint8Array {
  const header = new Uint8Array([0xa0]); // contents are skipped by the parser
  return cat(
    varint(header.length),
    header,
    ...blocks.map((b) =>
      cat(varint(b.cid.length + b.data.length), b.cid, b.data),
    ),
  );
}

function carResponse(body: Uint8Array): Response {
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/vnd.ipld.car; version=1" },
  });
}

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// ---------------------------------------------------------------------------

describe("IPFSResolver (verified)", () => {
  const realFetch = globalThis.fetch;
  const realTrust = IPFSResolver.trustGateway;
  let requestedUrls: string[];

  beforeEach(() => {
    IPFSResolver.trustGateway = false;
    requestedUrls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    IPFSResolver.trustGateway = realTrust;
  });

  const serve = (body: Uint8Array | Response) => {
    globalThis.fetch = (async (url: string | URL) => {
      requestedUrls.push(String(url));
      return body instanceof Response ? body.clone() : carResponse(body);
    }) as any;
  };

  it("verifies and returns a raw single-block file (CIDv1)", async () => {
    const content = text("module m (\n)");
    const cid = await cidV1Raw(content);
    serve(car([{ cid: cid.bytes, data: content }]));

    const resolver = new IPFSResolver();
    expect(await resolver.text(cid.str)).toBe("module m (\n)");
    expect(requestedUrls[0]).toContain(`${cid.str}?format=car`);
  });

  it("rejects content that does not hash to the requested CID", async () => {
    const cid = await cidV1Raw(text("honest content"));
    serve(car([{ cid: cid.bytes, data: text("evil content") }]));

    const resolver = new IPFSResolver();
    await expect(resolver.text(cid.str)).rejects.toThrow(
      /does not match its hash/,
    );
  });

  it("verifies a CIDv0 dag-pb file with inline data", async () => {
    const content = text("pinned script");
    const block = pbNode({ data: unixfs(2, content) });
    const cid = await cidV0(block);
    serve(car([{ cid: cid.bytes, data: block }]));

    const resolver = new IPFSResolver();
    expect(cid.str.startsWith("Qm")).toBe(true);
    expect(await resolver.text(cid.str)).toBe("pinned script");
  });

  it("resolves and verifies a file inside a directory (<cid>/name)", async () => {
    const content = text("file body");
    const leafCid = await cidV1Raw(content);
    const dir = pbNode({
      data: unixfs(1),
      links: [pbLink(leafCid.bytes, "file.txt")],
    });
    const dirCid = await cidV0(dir);
    serve(
      car([
        { cid: dirCid.bytes, data: dir },
        { cid: leafCid.bytes, data: content },
      ]),
    );

    const resolver = new IPFSResolver();
    expect(await resolver.text(`${dirCid.str}/file.txt`)).toBe("file body");
    await expect(resolver.text(`${dirCid.str}/other.txt`)).rejects.toThrow(
      /"other.txt" not found/,
    );
  });

  it("rejects a directory entry swapped for different content", async () => {
    const leafCid = await cidV1Raw(text("original"));
    const dir = pbNode({
      data: unixfs(1),
      links: [pbLink(leafCid.bytes, "file.txt")],
    });
    const dirCid = await cidV0(dir);
    serve(
      car([
        { cid: dirCid.bytes, data: dir },
        { cid: leafCid.bytes, data: text("swapped!!") },
      ]),
    );

    const resolver = new IPFSResolver();
    await expect(resolver.text(`${dirCid.str}/file.txt`)).rejects.toThrow(
      /does not match its hash/,
    );
  });

  it("reassembles multi-block (chunked) files", async () => {
    const a = text("chunk-a|");
    const b = text("chunk-b");
    const leafA = await cidV1Raw(a);
    const leafB = await cidV1Raw(b);
    const file = pbNode({
      data: unixfs(2),
      links: [pbLink(leafA.bytes, ""), pbLink(leafB.bytes, "")],
    });
    const fileCid = await cidV0(file);
    serve(
      car([
        { cid: fileCid.bytes, data: file },
        { cid: leafA.bytes, data: a },
        { cid: leafB.bytes, data: b },
      ]),
    );

    const resolver = new IPFSResolver();
    expect(decode(await resolver.bytes(fileCid.str))).toBe("chunk-a|chunk-b");
  });

  it("rejects gateways that answer with a non-CAR response", async () => {
    const content = text("anything");
    const cid = await cidV1Raw(content);
    serve(new Response("plain text", { status: 200 }));

    const resolver = new IPFSResolver();
    await expect(resolver.text(cid.str)).rejects.toThrow(/verifiable/);
  });

  it("returns verified directory entries via verifiedIpfsEntity", async () => {
    const leafCid = await cidV1Raw(text("file body"));
    const dir = pbNode({
      data: unixfs(1),
      links: [pbLink(leafCid.bytes, "file.txt")],
    });
    const dirCid = await cidV0(dir);
    serve(
      car([
        { cid: dirCid.bytes, data: dir },
        { cid: leafCid.bytes, data: text("file body") },
      ]),
    );

    const entity = await verifiedIpfsEntity(dirCid.str, "https://gw/ipfs/", {
      maxBytes: 0,
    });
    expect(entity.kind).toBe("directory");
    if (entity.kind === "directory") {
      expect(entity.entries).toEqual([{ name: "file.txt", cid: leafCid.str }]);
    }
    expect(requestedUrls[0]).toContain("entity-bytes=0:0");
  });

  it("returns a verified truncated head with size via verifiedIpfsEntity", async () => {
    const a = text("chunk-a|");
    const b = text("chunk-b");
    const leafA = await cidV1Raw(a);
    const leafB = await cidV1Raw(b);
    const file = pbNode({
      data: unixfs(2, undefined, a.length + b.length),
      links: [pbLink(leafA.bytes, ""), pbLink(leafB.bytes, "")],
    });
    const fileCid = await cidV0(file);
    serve(
      car([
        { cid: fileCid.bytes, data: file },
        { cid: leafA.bytes, data: a },
      ]),
    );

    const entity = await verifiedIpfsEntity(fileCid.str, "https://gw/ipfs/", {
      maxBytes: a.length,
    });
    expect(entity.kind).toBe("file");
    if (entity.kind === "file") {
      expect(decode(entity.bytes)).toBe("chunk-a|");
      expect(entity.size).toBe(15);
      expect(entity.complete).toBe(false);
    }
    expect(requestedUrls[0]).toContain(`entity-bytes=0:${a.length - 1}`);
  });

  it("rejects strings that are not CIDs", async () => {
    serve(car([]));
    const resolver = new IPFSResolver();
    await expect(resolver.text("QmTest")).rejects.toThrow(
      /not a supported CID/,
    );
  });
});

describe("IPFSResolver (trusted gateway mode)", () => {
  const realFetch = globalThis.fetch;
  const realTrust = IPFSResolver.trustGateway;
  beforeEach(() => {
    IPFSResolver.trustGateway = true;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    IPFSResolver.trustGateway = realTrust;
  });

  it("fetches text and caches successful results by cid", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("module m (\n)", { status: 200 });
    }) as any;

    const resolver = new IPFSResolver();
    expect(await resolver.text("QmTest")).toBe("module m (\n)");
    expect(await resolver.text("QmTest")).toBe("module m (\n)");
    expect(calls).toBe(1);
  });

  it("does not cache failures", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("nope", { status: 404, statusText: "Not Found" });
    }) as any;

    const resolver = new IPFSResolver();
    await expect(resolver.text("QmMiss")).rejects.toThrow(/404/);
    await expect(resolver.text("QmMiss")).rejects.toThrow(/404/);
    expect(calls).toBe(2);
  });
});
