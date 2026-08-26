import { describe, expect, it } from "bun:test";
import { gunzip, untar } from "@evmcrispr/sdk";
import { packWeb3Function } from "../../src/utils/tgz";

describe("gelato > packWeb3Function", () => {
  it("produces a gzipped tar with Gelato's three entries", async () => {
    const tgz = await packWeb3Function({
      indexJs: "export{};",
      sourceJs: "// src",
      schema: {
        web3FunctionVersion: "2.0.0",
        runtime: "js-1.0",
        memory: 128,
        timeout: 30,
        userArgs: { vault: "string" },
      },
    });
    expect(tgz[0]).toBe(0x1f); // gzip magic
    expect(tgz[1]).toBe(0x8b);
    const files = untar(await gunzip(tgz));
    // untar strips the archive's root directory (web3Function/).
    expect([...files.keys()].sort()).toEqual([
      "index.js",
      "schema.json",
      "source.js",
    ]);
    expect(new TextDecoder().decode(files.get("index.js"))).toBe("export{};");
    expect(
      JSON.parse(new TextDecoder().decode(files.get("schema.json"))).userArgs,
    ).toEqual({ vault: "string" });
  });

  it("is reproducible", async () => {
    const input = {
      indexJs: "a",
      sourceJs: "b",
      schema: {
        web3FunctionVersion: "2.0.0",
        runtime: "js-1.0",
        memory: 128,
        timeout: 30,
        userArgs: {},
      },
    };
    expect(await packWeb3Function(input)).toEqual(
      await packWeb3Function(input),
    );
  });
});
