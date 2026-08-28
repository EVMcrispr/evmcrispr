import { describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;
const TO = "0x44fA8E6f47987339850636F88629646662444217" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

function makeCtx(status: "success" | "reverted"): ActionHandlerCtx {
  const ctx: ActionHandlerCtx = {
    walletClient: {
      account: { address: FROM, type: "json-rpc" },
      sendTransaction: async () => HASH,
    } as any,
    getPublicClient: () =>
      ({
        waitForTransactionReceipt: async () => ({
          status,
          transactionHash: HASH,
        }),
      }) as any,
    onLog: () => {},
    next: async () => undefined,
  };
  return ctx;
}

describe("evml > execute > transaction handler", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });
  const action: TransactionAction = { to: TO, data: "0x1234", chainId: 1 };

  it("returns the receipt of a successful transaction", async () => {
    const receipt = (await handlers.transaction(
      action,
      makeCtx("success"),
    )) as {
      status: string;
    };
    expect(receipt.status).to.equal("success");
  });

  it("fails loudly when the mined transaction reverted", async () => {
    try {
      await handlers.transaction(action, makeCtx("reverted"));
      throw new Error("Expected handler to throw");
    } catch (err: any) {
      expect(err.message).to.include("reverted on-chain");
      expect(err.message).to.include(HASH);
    }
  });

  it("points at the requested endpoint when a routed transaction reverted", async () => {
    try {
      await handlers.transaction(
        { ...action, rpcUrl: "https://ingress.example" },
        makeCtx("reverted"),
      );
      throw new Error("Expected handler to throw");
    } catch (err: any) {
      expect(err.message).to.include("https://ingress.example");
    }
  });
});
