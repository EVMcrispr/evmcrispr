import { describe, expect, it } from "bun:test";
import type { Operand } from "../../src/onchain/types";
import type { HelperFunctionNode, NodesInterpreters } from "../../src/types";
import { defineHelper } from "../../src/utils/defineHelper";

const interpreters: NodesInterpreters = {
  interpretNode: async (n: any) => n?.value,
  interpretNodes: async (ns: any[]) => ns.map((n) => n?.value),
};

const helperNode = (name: string) =>
  ({ name, args: [] }) as unknown as HelperFunctionNode;

const constOperand: Operand = { kind: "const", cat: "Uint", value: "1" };

describe("defineHelper run/compile faces", () => {
  it("throws at definition time when neither face is present", () => {
    expect(() => defineHelper({ name: "faceless", args: [] } as any)).toThrow(
      "neither",
    );
  });

  it("attaches the compile face and the onchain marker to the wrapper", () => {
    const compile = async () => constOperand;
    const fn = defineHelper({
      name: "twofaced",
      args: [],
      run: async () => "ok",
      compile,
    });
    expect((fn as any).compile).toBe(compile);
    expect((fn as any).onchain).toBe(true);

    const runOnly = defineHelper({
      name: "offchain",
      args: [],
      run: async () => "ok",
    });
    expect((runOnly as any).compile).toBeUndefined();
    expect((runOnly as any).onchain).toBeUndefined();
  });

  it("poison-pills `!`-named nodes with the on-chain error", async () => {
    const fn = defineHelper({
      name: "twofaced!",
      args: [],
      run: async () => "never",
      compile: async () => constOperand,
    });
    await expect(
      fn(null as any, helperNode("twofaced!"), interpreters),
    ).rejects.toThrow("evaluates on-chain and is only valid inside");
  });

  it("rejects running a compile-only helper off-chain", async () => {
    const fn = defineHelper({
      name: "onchainonly",
      args: [],
      compile: async () => constOperand,
    });
    await expect(
      fn(null as any, helperNode("onchainonly"), interpreters),
    ).rejects.toThrow("evaluates on-chain and is only valid inside");
  });

  it("lifts the non-batchable gate inside a smart batch context", async () => {
    const fn = defineHelper({
      name: "reader",
      args: [],
      batchable: false,
      run: async () => "read",
    });
    const batched: NodesInterpreters = {
      ...interpreters,
      batchContext: { name: "batch", hasActions: true },
    };
    await expect(
      fn(null as any, helperNode("reader"), batched),
    ).rejects.toThrow("batch-build time");

    const smart: NodesInterpreters = {
      ...interpreters,
      batchContext: { name: "batch", hasActions: true, smart: true },
    };
    expect(await fn(null as any, helperNode("reader"), smart)).toBe("read");
  });
});
