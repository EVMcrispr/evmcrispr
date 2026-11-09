import { describe, it } from "bun:test";
import type { FrameAction } from "@evmcrispr/sdk";
import { chainLabel } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../src/evml/execute";
import { makeDefaultHandlers } from "../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;

const ctx: ActionHandlerCtx = {
  walletClient: {} as any,
  getPublicClient: () => ({}) as any,
  onLog: () => {},
  next: async () => undefined,
};

describe("evml > execute > frame handler", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });

  it("default handlers refuse a frame action", async () => {
    const action: FrameAction = {
      type: "frame",
      chainId: 1337,
      from: FROM,
      frames: [{ mode: "sender", target: null, data: "0x", value: 0n }],
      mempool: "alt",
    };

    let message = "";
    try {
      await handlers.frame(action, ctx);
    } catch (err: any) {
      message = err.message;
    }
    expect(message).to.include("cannot send frame transactions");
    expect(message).to.include(chainLabel(1337));
  });
});
