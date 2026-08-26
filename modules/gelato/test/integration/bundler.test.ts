import { describe, expect, it } from "bun:test";
import pkg from "../../package.json";
import { bundleWeb3Function, ESBUILD_VERSION } from "../../src/utils/bundler";

const FUNCTION = `
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";

Web3Function.onRun(async ({ userArgs }: Web3FunctionContext) => {
  return { canExec: true, callData: [{ to: userArgs.vault as string, data: "0x" }] };
});
`;

// Bundling pulls the SDK closure from the npm registry (verified tarballs),
// so this is an integration test: network, ~40 tarballs on first use.
describe("gelato > bundleWeb3Function", () => {
  it("pins the esbuild-wasm release the module depends on", () => {
    expect(pkg.dependencies["esbuild-wasm"]).toBe(ESBUILD_VERSION);
  });

  it("bundles the SDK into a self-contained ESM file", async () => {
    const { indexJs, sourceJs, warnings } = await bundleWeb3Function(FUNCTION);
    expect(indexJs.length).toBeGreaterThan(100_000);
    expect(indexJs.length).toBeLessThan(1024 * 1024);
    expect(indexJs).not.toContain("@gelatonetwork/web3-functions-sdk");
    expect(indexJs).toContain("canExec");
    expect(sourceJs).toContain('from "@gelatonetwork/web3-functions-sdk"');
    expect(sourceJs).not.toContain("Web3FunctionContext"); // types erased
    expect(warnings).toEqual([]);
  }, 120_000);

  it("rejects unpinned imports with a pin suggestion", async () => {
    await expect(
      bundleWeb3Function(`import "viem"; export {};`),
    ).rejects.toThrow(/not pinned.*viem@\d/);
  }, 60_000);

  it("rejects node builtins and relative imports", async () => {
    await expect(
      bundleWeb3Function(`import fs from "fs"; console.log(fs);`),
    ).rejects.toThrow("Node.js builtin");
    await expect(
      bundleWeb3Function(`import "./helper"; export {};`),
    ).rejects.toThrow("single file");
  }, 60_000);

  it("surfaces TypeScript syntax errors with a location", async () => {
    await expect(bundleWeb3Function(`const x: = 1;`)).rejects.toThrow(
      /index\.ts:1:/,
    );
  }, 60_000);
});
