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

  it("the module does not declare chain 1337", () => {
    expect(chains.some((c) => c.id === 1337)).toBe(false);
    expect(chainLabel(1337)).not.toBe("Alt-mempool devnet");
  });
});

describe("frame > local devnets", () => {
  it("declares the quick and the mining devnet on chains of their own", () => {
    expect(chains.map((c) => [c.key, c.id])).toEqual([
      ["framesQuick", 81411],
      ["framesMining", 81412],
    ]);
    for (const chain of chains)
      expect(new URL(chain.rpcUrl).hostname).toBe("127.0.0.1");
  });

  it("switch reaches them by name", async () => {
    for (const [key, id] of [
      ["framesQuick", 81411],
      ["framesMining", 81412],
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
