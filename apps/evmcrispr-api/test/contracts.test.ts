import { describe, expect, it } from "bun:test";
import { HOUR, YEAR } from "../src/api/common.js";
import { readVerified, sourceFiles } from "../src/api/contracts.js";
import { ADDRESS, reply, setup } from "./api-utils.js";

const entry = {
  ContractName: "Token",
  ABI: '[{"type":"constructor","inputs":[]}]',
  CompilerVersion: "v0.8.28",
  OptimizationUsed: "1",
  Runs: "200",
  Proxy: "1",
  Implementation: "never-cache-this",
  EVMVersion: "Default",
  LicenseType: "MIT",
  SourceCode:
    '{{"language":"Solidity","sources":{"Token.sol":{"content":"contract Token {}"},"lib/Lib.sol":{"content":"library Lib {}"}}}}',
};
const verified = { status: "1", result: [entry] };

describe("contract and source compatibility", () => {
  it("normalizes Etherscan, flattened and Blockscout sources without caching implementation", () => {
    const result = readVerified("etherscan", 200, verified);
    expect(result.kind).toBe("verified");
    if (result.kind !== "verified") throw new Error("missing fixture");
    expect(result.meta).toEqual({
      name: "Token",
      abi: [{ type: "constructor", inputs: [] }],
      compilerVersion: "0.8.28",
      optimizationUsed: true,
      runs: 200,
      isProxy: true,
      license: "MIT",
      files: ["Token.sol", "lib/Lib.sol"],
    });
    expect(result.source.files).toEqual({
      "Token.sol": "contract Token {}",
      "lib/Lib.sol": "library Lib {}",
    });
    expect(sourceFiles("contract C {}", "C")).toEqual({
      "C.sol": "contract C {}",
    });
    const blockscout = readVerified("blockscout", 200, {
      status: "1",
      result: [
        {
          ...entry,
          SourceCode: "main",
          FileName: "src/Token.sol",
          AdditionalSources: [
            { Filename: "lib/Lib.sol", SourceCode: "library" },
          ],
          IsProxy: "true",
          OptimizationUsed: "true",
          OptimizationRuns: "300",
        },
      ],
    });
    expect(blockscout.kind === "verified" && blockscout.source.files).toEqual({
      "src/Token.sol": "main",
      "lib/Lib.sol": "library",
    });
    expect(blockscout.kind === "verified" && blockscout.meta.runs).toBe(300);
    const fallbackRuns = readVerified("blockscout", 200, {
      status: "1",
      result: [
        {
          ...entry,
          OptimizationRuns: "",
          CompilerSettings: { optimizer: { runs: 400 } },
        },
      ],
    });
    expect(fallbackRuns.kind === "verified" && fallbackRuns.meta.runs).toBe(
      400,
    );
  });

  it("reads the Rust service's Sourcify proxy and multi-file fixtures", async () => {
    for (const [file, name, proxy] of [
      ["sourcify-usdc-proxy", "FiatTokenProxy", true],
      ["sourcify-uniswap-v2-router02", "UniswapV2Router02", false],
    ] as const) {
      const fixture: unknown = await Bun.file(
        `${import.meta.dir}/fixtures/${file}.json`,
      ).json();
      const result = readVerified("sourcify", 200, fixture);
      expect(result.kind).toBe("verified");
      if (result.kind !== "verified") throw new Error("invalid fixture");
      expect(result.meta.name).toBe(name);
      expect(result.meta.isProxy).toBe(proxy);
      expect(Object.keys(result.source.files as object).length).toBeGreaterThan(
        0,
      );
      expect(result.meta).not.toHaveProperty("implementation");
      expect(result.source).not.toHaveProperty("implementation");
    }
  });

  it("falls through unverified providers, caches source/metadata/ABI, and reads one exact file", async () => {
    const urls: string[] = [];
    const api = setup(
      async (url) => {
        urls.push(String(url));
        return String(url).includes("sourcify")
          ? reply({ match: null })
          : reply(verified);
      },
      { CONTRACT_KV_CACHE: "on", CONTRACT_LIMIT: "1" },
    );
    const response = await api.request(
      `/source/01/${ADDRESS.toUpperCase().replace("0X", "0x")}?sourcify&file=lib%2FLib.sol`,
    );
    expect(await response.json()).toEqual({
      name: "Token",
      files: { "lib/Lib.sol": "library Lib {}" },
    });
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(urls).toHaveLength(2);
    expect((await api.request(`/contract/1/${ADDRESS}`)).status).toBe(200);
    expect(await (await api.request(`/abi/1/${ADDRESS}`)).json()).toEqual([
      { type: "constructor", inputs: [] },
    ]);
    const missing = await api.request(`/source/1/${ADDRESS}?file=missing.sol`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "no such file",
      file: "missing.sol",
      files: ["Token.sol", "lib/Lib.sol"],
    });
    expect(urls).toHaveLength(2);
  });

  it("serves stale verified data on outages but replaces it with confirmed unverified status", async () => {
    const api = setup(async () => reply(verified), { CONTRACT_KV_CACHE: "on" });
    expect((await api.request(`/source/1/${ADDRESS}`)).status).toBe(200);
    api.advance(YEAR + 1);
    api.context.fetch = async () => {
      throw new Error("provider offline");
    };
    expect((await api.request(`/source/1/${ADDRESS}`)).status).toBe(200);
    api.context.fetch = async (url) =>
      String(url).includes("etherscan")
        ? reply({
            status: "1",
            result: [
              { ContractName: "", ABI: "Contract source code not verified" },
            ],
          })
        : reply({ status: "0", result: "not found" });
    expect((await api.request(`/source/1/${ADDRESS}`)).status).toBe(404);
    api.context.fetch = async () => {
      throw new Error("should use negative cache");
    };
    expect((await api.request(`/contract/1/${ADDRESS}`)).status).toBe(404);
    api.advance(HOUR + 1);
    expect((await api.request(`/contract/1/${ADDRESS}`)).status).toBe(502);
  });

  it("disables contract storage by default and preserves ABI provider fallback rules", async () => {
    const calls: string[] = [];
    const api = setup(async (url) => {
      calls.push(String(url));
      return reply(verified);
    });
    await api.request(`/contract/1/${ADDRESS}`);
    await api.request(`/contract/1/${ADDRESS}`);
    expect(calls).toHaveLength(2);
    api.context.fetch = async (url) =>
      String(url).includes("etherscan")
        ? reply({ status: "0", result: "missing" })
        : reply({ status: "1", result: "[]" });
    expect(await (await api.request(`/abi/1/${ADDRESS}`)).json()).toEqual([]);
    api.advance(YEAR + 1);
    api.context.fetch = async () => {
      throw new Error("offline");
    };
    expect(await (await api.request(`/abi/1/${ADDRESS}`)).json()).toEqual([]);
    expect((await api.request("/abi/1/invalid")).status).toBe(400);
    expect(
      (await api.request(`/contract/18446744073709551616/${ADDRESS}`)).status,
    ).toBe(400);
  });
});

describe("token lists", () => {
  it("normalizes CoinGecko data, caches it, and serves stale data during outages", async () => {
    let calls = 0;
    const api = setup(async (url) => {
      calls++;
      return String(url).includes("asset_platforms")
        ? reply([{ chain_identifier: 1, id: "ethereum", name: "Ethereum" }])
        : reply({
            timestamp: "2026-01-01T00:00:00Z",
            tokens: [
              { address: ADDRESS, symbol: "T", extensions: { bridge: true } },
            ],
          });
    });
    const response = await api.request("/tokenlist/1");
    const data = await response.json();
    expect(data.name).toBe("EVMcrispr Token List (Ethereum)");
    expect(data.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(data.tokens[0]).toEqual({
      address: ADDRESS,
      symbol: "T",
      name: "",
      chainId: 0,
      decimals: 0,
      extensions: { bridge: true },
    });
    await api.request("/tokenlist/1");
    expect(calls).toBe(2);
    api.advance(6 * 24 * HOUR);
    api.context.fetch = async () => {
      throw new Error("offline");
    };
    expect(await (await api.request("/tokenlist/1")).json()).toEqual(data);
    expect((await api.request("/tokenlist/0")).status).toBe(400);
  });
});
