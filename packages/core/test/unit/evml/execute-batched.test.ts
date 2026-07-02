import { describe, it } from "bun:test";
import type { BatchedAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;
const TO = "0x44fA8E6f47987339850636F88629646662444217" as const;

function makeCtx(overrides: Partial<ActionHandlerCtx> = {}): ActionHandlerCtx {
  const ctx: ActionHandlerCtx = {
    walletClient: {
      switchChain: async () => {},
      sendCalls: async () => ({ id: "0x1" }),
      waitForCallsStatus: async () => ({ status: "success", receipts: [] }),
    } as any,
    getPublicClient: () => ({}) as any,
    onLog: () => {},
    next: async () => undefined,
    ...overrides,
  };
  return ctx;
}

describe("evml > execute > batched handler", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });

  async function expectRejects(promise: Promise<unknown>, message: string) {
    try {
      await promise;
      throw new Error("Expected handler to throw");
    } catch (err: any) {
      expect(err.message).to.include(message);
    }
  }

  it("throws when the batch contains a contract deployment (no target address)", async () => {
    const action: BatchedAction = {
      type: "batched",
      chainId: 1,
      from: FROM,
      actions: [
        { to: TO, data: "0x1234" },
        { data: "0x6080604052", from: FROM }, // plain CREATE deployment
      ],
    };

    await expectRejects(
      handlers.batched(action, makeCtx()),
      "Contract deployments (no target address) cannot be executed in a batch",
    );
  });

  it("throws when the batch mixes chains", async () => {
    const action: BatchedAction = {
      type: "batched",
      chainId: 1,
      from: FROM,
      actions: [{ to: TO, data: "0x1234", chainId: 10 }],
    };

    await expectRejects(
      handlers.batched(action, makeCtx()),
      "Batch contains transactions for multiple chains",
    );
  });
});
