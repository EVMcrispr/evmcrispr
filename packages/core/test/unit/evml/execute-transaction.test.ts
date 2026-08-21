import { describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;
const TO = "0x44fA8E6f47987339850636F88629646662444217" as const;
const HASH =
  "0x08a95d14f0521ff9998a5e6e1bc7bc0a331e264cbfa66a2bcdff8b0c0f628b3a" as const;

function makeCtx(logs: string[]): ActionHandlerCtx {
  return {
    walletClient: {
      account: { address: FROM },
      sendTransaction: async () => HASH,
    } as any,
    getPublicClient: () =>
      ({
        waitForTransactionReceipt: async () => ({ logs: [] }),
      }) as any,
    onLog: (message: string) => logs.push(message),
    next: async () => undefined,
  };
}

describe("evml > execute > transaction handler", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });

  it("links the confirmed transaction to the chain's block explorer", async () => {
    const logs: string[] = [];
    const action: TransactionAction = {
      chainId: 1,
      from: FROM,
      to: TO,
      data: "0x",
    };

    await handlers.transaction(action, makeCtx(logs));

    const confirmed = logs.find((l) => l.includes("Transaction confirmed"));
    expect(confirmed).to.include(`](https://etherscan.io/tx/${HASH})`);
  });

  it("logs the full hash without a link when the chain has no explorer", async () => {
    const logs: string[] = [];
    const action: TransactionAction = {
      chainId: 55_555_555_555,
      from: FROM,
      to: TO,
      data: "0x",
    };

    await handlers.transaction(action, makeCtx(logs));

    const confirmed = logs.find((l) => l.includes("Transaction confirmed"));
    expect(confirmed).to.include(HASH);
    expect(confirmed).to.not.include("](");
  });
});
