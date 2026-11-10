import "../setup";
import { describe, expect, it } from "bun:test";
import { chainLabel } from "@evmcrispr/sdk";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { chains } from "../../src/chains";

describe("frame > chain 1337", () => {
  it("switch 1337 stays on chain 1337", async () => {
    const interpreter = createInterpreter("switch 1337", undefined as never, {
      chainId: 1,
    });
    await interpreter.interpret();
    expect(await interpreter.evm.getChainId()).toBe(1337);
  });

  it("the module declares the public frame devnets, on ids other networks share", () => {
    const shared = chains.filter((c) => c.sharedId);
    expect(shared.map((c) => [c.key, c.id])).toEqual([
      ["altMempoolDevnet", 1337],
      ["hegotaDevnet", 3151908],
    ]);
    expect(chainLabel(1337)).toBe("Alt-mempool devnet");
  });

  it("switch reaches the public devnets by name", async () => {
    for (const [key, id] of [
      ["altMempoolDevnet", 1337],
      ["hegotaDevnet", 3151908],
    ] as const) {
      const interpreter = createInterpreter(
        `load frames\nswitch ${key}`,
        undefined as never,
        { chainId: 1 },
      );
      await interpreter.interpret();
      expect(await interpreter.evm.getChainId()).toBe(id);
    }
  });
});

describe("frame > local devnets", () => {
  it("declares the quick, the mining and the alt-mempool devnet on chains of their own", () => {
    const local = chains.filter((c) => !c.sharedId);
    expect(local.map((c) => [c.key, c.id])).toEqual([
      ["framesQuick", 81411],
      ["framesMining", 81412],
      ["framesAltMempool", 81413],
    ]);
    for (const chain of local)
      expect(new URL(chain.rpcUrl).hostname).toBe("127.0.0.1");
  });

  it("switch reaches them by name", async () => {
    for (const [key, id] of [
      ["framesQuick", 81411],
      ["framesMining", 81412],
      ["framesAltMempool", 81413],
    ] as const) {
      const interpreter = createInterpreter(
        `load frames\nswitch ${key}`,
        undefined as never,
        { chainId: 1 },
      );
      await interpreter.interpret();
      expect(await interpreter.evm.getChainId()).toBe(id);
    }
  });
});
