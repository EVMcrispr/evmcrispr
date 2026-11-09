import { describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { registerChains } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;
const TO = "0x44fA8E6f47987339850636F88629646662444217" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const SHARED = 913380;
const OWN = 913381;
const PUBLIC_GENESIS = `0x${"aa".repeat(32)}`;
const LOCAL_GENESIS = `0x${"bb".repeat(32)}`;

registerChains(
  {
    id: SHARED,
    key: "sharedUnitDevnet",
    name: "Shared unit devnet",
    rpcUrl: "http://127.0.0.1:9",
    sharedId: true,
  },
  {
    id: OWN,
    key: "ownUnitDevnet",
    name: "Own unit devnet",
    rpcUrl: "http://127.0.0.1:9",
  },
);

/** A node that says block 0 is `genesis`. */
const node =
  (genesis: string | undefined) =>
  async ({ method }: { method: string }) => {
    if (method === "eth_getBlockByNumber")
      return genesis ? { hash: genesis } : null;
    throw new Error(`unexpected ${method}`);
  };

function ctx(
  wallet: string | undefined,
  reads: string,
): ActionHandlerCtx & {
  sent: number;
} {
  const out = {
    sent: 0,
    walletClient: {
      account: { address: FROM, type: "json-rpc" },
      request: node(wallet),
      sendTransaction: async () => {
        out.sent++;
        return HASH;
      },
    } as any,
    getPublicClient: () =>
      ({
        request: node(reads),
        waitForTransactionReceipt: async () => ({
          status: "success",
          transactionHash: HASH,
        }),
      }) as any,
    onLog: () => {},
    next: async () => undefined,
  };
  return out;
}

describe("evml > execute > a chain whose id other networks share", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });
  const action = (chainId: number): TransactionAction => ({
    to: TO,
    data: "0x",
    chainId,
  });

  it("sends when the wallet is on the node the chain is read from", async () => {
    const c = ctx(PUBLIC_GENESIS, PUBLIC_GENESIS);
    await handlers.transaction(action(SHARED), c);
    expect(c.sent).to.equal(1);
  });

  it("refuses, before anything is signed, a wallet on another network with the same id", async () => {
    const c = ctx(LOCAL_GENESIS, PUBLIC_GENESIS);
    try {
      await handlers.transaction(action(SHARED), c);
      throw new Error("Expected the handler to refuse");
    } catch (err: any) {
      expect(err.message).to.include(
        `The wallet's chain ${SHARED} is another network than the Shared unit devnet`,
      );
      expect(err.message).to.include(
        `or set chain ${SHARED}'s RPC to the wallet's node.`,
      );
    }
    expect(c.sent).to.equal(0);
  });

  it("does not ask a chain whose id is its own, nor refuse a wallet that does not say", async () => {
    const own = ctx(LOCAL_GENESIS, PUBLIC_GENESIS);
    await handlers.transaction(action(OWN), own);
    expect(own.sent).to.equal(1);
    const silent = ctx(undefined, PUBLIC_GENESIS);
    await handlers.transaction(action(SHARED), silent);
    expect(silent.sent).to.equal(1);
  });
});
