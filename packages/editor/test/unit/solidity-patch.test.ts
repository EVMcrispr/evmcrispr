import { afterEach, describe, expect, it } from "bun:test";
import { solidityChunkId } from "../../src/editor/solidity-patch";

// Shape of monaco 0.56's min/vs/basic-languages/monaco.contribution.js:
// every language chunk is a hashed sibling loaded through the AMD loader.
const CONTRIBUTION =
  'i({id:"shell",extensions:[".sh"],loader:()=>new Promise((e,s)=>a(["../shell-ClXCKCEW"],e,s))}),' +
  'i({id:"sol",extensions:[".sol"],aliases:["sol","solidity","Solidity"],loader:()=>new Promise((e,s)=>a(["../solidity-MZ6ExpPy"],e,s))}),' +
  'i({id:"aes",extensions:[".aes"],loader:()=>new Promise((e,s)=>a(["../sophia-DWkuSsPQ"],e,s))})';

// Pre-0.56 layout: unhashed per-language directories.
const LEGACY_CONTRIBUTION =
  'i({id:"sol",extensions:[".sol"],loader:()=>new Promise((e,s)=>a(["./solidity/solidity"],e,s))})';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(body: string | null) {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(url);
    return Promise.resolve(
      body === null
        ? new Response("Not Found", { status: 404 })
        : new Response(body, { status: 200 }),
    );
  }) as typeof fetch;
  return calls;
}

describe("solidityChunkId", () => {
  it("reads the hashed solidity chunk out of the basic-languages contribution", async () => {
    const calls = stubFetch(CONTRIBUTION);
    await expect(solidityChunkId("/vs")).resolves.toBe("vs/solidity-MZ6ExpPy");
    expect(calls).toEqual(["/vs/basic-languages/monaco.contribution.js"]);
  });

  it("resolves the legacy per-directory layout too", async () => {
    stubFetch(LEGACY_CONTRIBUTION);
    await expect(solidityChunkId("/vs")).resolves.toBe(
      "vs/basic-languages/solidity/solidity",
    );
  });

  it("is undefined when the contribution cannot be read", async () => {
    stubFetch(null);
    await expect(solidityChunkId("/vs")).resolves.toBeUndefined();
    stubFetch("nothing about solidity here");
    await expect(solidityChunkId("/vs")).resolves.toBeUndefined();
  });
});
