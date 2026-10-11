import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { IPFS_PIN_URL, pinToIpfs } from "../../src/utils/ipfsPin";
import {
  SINGLE_BLOCK_LIMIT,
  singleBlockCid,
} from "../../src/utils/verifiedIpfs";

const text = (s: string) => new TextEncoder().encode(s);

const JSON_BODY = {
  pinataOptions: { cidVersion: 0 },
  pinataContent: { title: "t", script: "s" },
};
// What Pinata stores for it: the content alone, compact.
const JSON_BYTES = text(JSON.stringify(JSON_BODY.pinataContent));
// The address of something else entirely ("hello world\n").
const OTHER_CID = "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o";

const fileForm = (content: string | Uint8Array, name = "hello.txt") => {
  const form = new FormData();
  form.append("file", new Blob([content as BlobPart]), name);
  form.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
  return form;
};

describe("singleBlockCid", () => {
  it("is the address a default add gives a small file", async () => {
    expect(await singleBlockCid(text("hello world\n"))).toBe(OTHER_CID);
    expect(await singleBlockCid(new Uint8Array())).toBe(
      "QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH",
    );
  });

  it("has no answer for a file of more than one block", async () => {
    expect(
      await singleBlockCid(new Uint8Array(SINGLE_BLOCK_LIMIT + 1)),
    ).toBeUndefined();
  });
});

describe("pinToIpfs", () => {
  const realFetch = globalThis.fetch;
  let requests: { url: string; init: RequestInit }[];

  const reply = (make: () => Response) => {
    globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
      requests.push({ url: String(url), init });
      return make();
    }) as any;
  };
  const header = (i: number, name: string) =>
    new Headers(requests[i].init.headers).get(name);

  beforeEach(() => {
    requests = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("pins JSON through the API, with no token, when none is given", async () => {
    const cid = await singleBlockCid(JSON_BYTES);
    reply(() => Response.json({ cid }));

    expect(await pinToIpfs(JSON_BODY)).toBe(cid!);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(IPFS_PIN_URL);
    expect(requests[0].init.method).toBe("POST");
    expect(header(0, "Content-Type")).toBe("application/json");
    expect(header(0, "Authorization")).toBeNull();
    // Key order is what the pinned bytes, and so the CID, depend on.
    expect(requests[0].init.body).toBe(JSON.stringify(JSON_BODY));
  });

  it("pins a file through the API as the multipart body it was given", async () => {
    const cid = await singleBlockCid(text("hello"));
    reply(() => Response.json({ cid }));
    const form = fileForm("hello");

    expect(await pinToIpfs(form)).toBe(cid!);
    expect(requests[0].url).toBe(IPFS_PIN_URL);
    expect(requests[0].init.body).toBe(form);
    // The runtime sets the multipart boundary; setting the type by hand
    // would drop it.
    expect(header(0, "Content-Type")).toBeNull();
  });

  it("pins somewhere else when told to", async () => {
    const cid = await singleBlockCid(JSON_BYTES);
    reply(() => Response.json({ cid }));

    await pinToIpfs(JSON_BODY, { pinUrl: "http://localhost:3000/ipfs/pin" });
    expect(requests[0].url).toBe("http://localhost:3000/ipfs/pin");
  });

  it("goes straight to Pinata with a token", async () => {
    const jsonCid = await singleBlockCid(JSON_BYTES);
    reply(() => Response.json({ IpfsHash: jsonCid, PinSize: 1 }));

    expect(await pinToIpfs(JSON_BODY, { jwt: "my-token" })).toBe(jsonCid!);
    expect(requests[0].url).toBe(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    );
    expect(header(0, "Authorization")).toBe("Bearer my-token");

    const fileCid = await singleBlockCid(text("hello"));
    reply(() => Response.json({ IpfsHash: fileCid }));
    await pinToIpfs(fileForm("hello"), { jwt: "my-token" });
    expect(requests[1].url).toBe(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
    );
    expect(header(1, "Authorization")).toBe("Bearer my-token");
  });

  // The service is not trusted for the address: whoever answers could name
  // someone else's content, and the caller would share or run that.
  it("refuses an address that is not the JSON it sent", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    await expect(pinToIpfs(JSON_BODY)).rejects.toThrow(
      /does not match the content/,
    );
  });

  it("refuses an address that is not the file it sent", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    await expect(pinToIpfs(fileForm("hello"))).rejects.toThrow(
      /does not match the content/,
    );
  });

  it("refuses the same from Pinata itself", async () => {
    reply(() => Response.json({ IpfsHash: OTHER_CID }));
    await expect(pinToIpfs(JSON_BODY, { jwt: "my-token" })).rejects.toThrow(
      /does not match the content/,
    );
  });

  it("refuses an answer that is not an address at all", async () => {
    reply(() => Response.json({ cid: "../../etc/passwd" }));
    await expect(pinToIpfs(fileForm("hello"))).rejects.toThrow(
      /does not match the content/,
    );
  });

  it("takes on trust what it cannot check: a file of several blocks", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    const big = new Uint8Array(SINGLE_BLOCK_LIMIT + 1);
    expect(await pinToIpfs(fileForm(big))).toBe(OTHER_CID);
  });

  it("takes on trust what it cannot check: a directory", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    const form = new FormData();
    form.append("file", new Blob(["a"]), "site/a.txt");
    form.append("file", new Blob(["b"]), "site/b.txt");
    expect(await pinToIpfs(form)).toBe(OTHER_CID);

    // One file under a folder is still a directory to the pinning service.
    const one = new FormData();
    one.append("file", new Blob(["a"]), "site/a.txt");
    expect(await pinToIpfs(one)).toBe(OTHER_CID);
  });

  // Scripts and modules must stay one block, so that whoever opens them
  // can check them from the plain file.
  it("refuses, when asked for a single block, JSON that would not fit one", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    const body = {
      pinataContent: { script: "x".repeat(SINGLE_BLOCK_LIMIT) },
    };
    await expect(pinToIpfs(body, { singleBlock: true })).rejects.toThrow(
      /256 KB/,
    );
    // Refused before anything is sent.
    expect(requests).toHaveLength(0);
  });

  it("refuses, when asked for a single block, a file that would not fit one", async () => {
    reply(() => Response.json({ cid: OTHER_CID }));
    const big = new Uint8Array(SINGLE_BLOCK_LIMIT + 1);
    await expect(
      pinToIpfs(fileForm(big), { singleBlock: true }),
    ).rejects.toThrow(/256 KB/);
    expect(requests).toHaveLength(0);
  });

  it("pins what fits a single block as before", async () => {
    const cid = await singleBlockCid(JSON_BYTES);
    reply(() => Response.json({ cid }));
    expect(await pinToIpfs(JSON_BODY, { singleBlock: true })).toBe(cid!);

    const edge = new Uint8Array(SINGLE_BLOCK_LIMIT).fill(7);
    const edgeCid = await singleBlockCid(edge);
    reply(() => Response.json({ cid: edgeCid }));
    expect(await pinToIpfs(fileForm(edge), { singleBlock: true })).toBe(
      edgeCid!,
    );
  });

  it("still refuses, for what it cannot check, an answer that is no address", async () => {
    const big = new Uint8Array(SINGLE_BLOCK_LIMIT + 1);
    for (const cid of [
      "../../etc/passwd",
      "QmNotACid",
      "https://evil.example",
    ]) {
      reply(() => Response.json({ cid }));
      await expect(pinToIpfs(fileForm(big))).rejects.toThrow(
        /is not an IPFS address/,
      );
    }
  });

  it("says why the service refused", async () => {
    reply(() =>
      Response.json(
        { error: "too many pins; try again later" },
        { status: 429 },
      ),
    );
    await expect(pinToIpfs(JSON_BODY)).rejects.toThrow(
      /429.*too many pins; try again later/,
    );
  });

  it("reports Pinata's own error shape", async () => {
    reply(() =>
      Response.json(
        { error: { reason: "INVALID_CREDENTIALS", details: "token expired" } },
        { status: 401 },
      ),
    );
    await expect(pinToIpfs(JSON_BODY, { jwt: "old" })).rejects.toThrow(
      /401.*token expired/,
    );
  });

  it("fails when the answer carries no address", async () => {
    reply(() => Response.json({}));
    await expect(pinToIpfs(JSON_BODY)).rejects.toThrow(/no CID/);
  });

  it("fails when the service cannot be reached", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as any;
    await expect(pinToIpfs(JSON_BODY)).rejects.toThrow(/Couldn't reach/);
  });
});
