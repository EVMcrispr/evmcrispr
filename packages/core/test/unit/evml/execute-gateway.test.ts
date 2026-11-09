import { afterEach, expect as bunExpect, describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { registerChains } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";

const FROM = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3" as const;
const TO = "0x44fA8E6f47987339850636F88629646662444217" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const GATEWAY = "https://gateway.example/l1";

// One chain whose gateway is not its RPC (an L1 behind an EEZ composer),
// one reached through its gateway (the rollup).
registerChains(
  {
    id: 990001,
    key: "gatewayTestL1",
    name: "Gateway Test L1",
    rpcUrl: "https://rpc.example",
    gateway: GATEWAY,
  },
  {
    id: 990002,
    key: "gatewayTestL2",
    name: "Gateway Test L2",
    rpcUrl: "https://gateway.example/l2",
    gateway: "https://gateway.example/l2",
  },
);

type Option = Record<string, unknown>;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answer `eez_quoteFee` with `option`, recording what was asked. */
function gatewayAnswering(option: Option) {
  const asked: { url: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    asked.push({ url, body });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { version: 1, options: [{ type: "0x2", ...option }] },
      }),
    );
  }) as typeof fetch;
  return asked;
}

function makeCtx() {
  const sent: any[] = [];
  const logs: string[] = [];
  const ctx: ActionHandlerCtx = {
    walletClient: {
      account: { address: FROM, type: "json-rpc" },
      sendTransaction: async (request: any) => {
        sent.push(request);
        return HASH;
      },
    } as any,
    getPublicClient: () =>
      ({
        waitForTransactionReceipt: async () => ({
          status: "success",
          transactionHash: HASH,
        }),
      }) as any,
    onLog: (message) => logs.push(message),
    next: async () => undefined,
  };
  return { ctx, sent, logs };
}

describe("evml > execute > gateway pricing", () => {
  const handlers = makeDefaultHandlers({
    account: FROM,
    maximizeGasLimit: false,
  });
  const action = (chainId: number, extra: Partial<TransactionAction> = {}) =>
    ({
      to: TO,
      data: "0x1234",
      chainId,
      gas: 400_000n,
      ...extra,
    }) as TransactionAction;

  it("sends a quoted transaction at the gateway's gas and fees, with headroom", async () => {
    const asked = gatewayAnswering({
      gas: "0x61a80",
      maxFeePerGas: "0x40000000",
      maxPriorityFeePerGas: "0x3ffffff0",
    });
    const { ctx, sent } = makeCtx();
    await handlers.transaction(action(990001), ctx);

    expect(asked).to.have.lengthOf(1);
    expect(asked[0].url).to.equal(GATEWAY);
    expect(asked[0].body.method).to.equal("eez_quoteFee");
    expect(asked[0].body.params[0]).to.include({
      from: FROM,
      to: TO,
      data: "0x1234",
      gas: "0x61a80",
      chainId: "0xf1b31",
    });
    expect(sent).to.have.lengthOf(1);
    expect(sent[0].gas).to.equal(400_000n);
    expect(sent[0].maxFeePerGas).to.equal((0x40000000n * 125n) / 100n);
    expect(sent[0].maxPriorityFeePerGas).to.equal((0x3ffffff0n * 125n) / 100n);
  });

  it("tells a browser wallet that the transaction must reach the gateway", async () => {
    gatewayAnswering({
      gas: "0x61a80",
      maxFeePerGas: "0x10",
      maxPriorityFeePerGas: "0x8",
    });
    const { ctx, logs } = makeCtx();
    await handlers.transaction(action(990001), ctx);
    expect(logs.join("\n")).to.include(`must reach ${GATEWAY}`);
  });

  it("says nothing when the gateway is the chain's own RPC", async () => {
    gatewayAnswering({
      gas: "0x61a80",
      maxFeePerGas: "0x10",
      maxPriorityFeePerGas: "0x8",
    });
    const { ctx, logs, sent } = makeCtx();
    await handlers.transaction(action(990002), ctx);
    expect(logs.join("\n")).not.to.include("must reach");
    expect(sent[0].maxPriorityFeePerGas).to.equal(10n);
  });

  it("sends a transaction the gateway does not quote as it was", async () => {
    gatewayAnswering({
      error: { code: "unsupported_transaction", message: "not cross-chain" },
    });
    const { ctx, sent, logs } = makeCtx();
    await handlers.transaction(action(990001), ctx);
    expect(sent[0].maxFeePerGas).to.equal(undefined);
    expect(sent[0].maxPriorityFeePerGas).to.equal(undefined);
    expect(sent[0].gas).to.equal(400_000n);
    expect(logs.join("\n")).not.to.include("must reach");
  });

  it("says why the gateway would not price a transaction it then refuses", async () => {
    gatewayAnswering({
      error: {
        code: "unsupported_transaction",
        message:
          "unsupported quote: gas estimation or final effect validation failed",
      },
    });
    const { ctx } = makeCtx();
    (ctx.walletClient as any).sendTransaction = async () => {
      throw new Error(
        "Transaction creation failed. settlement tariff admission failed",
      );
    };
    await bunExpect(handlers.transaction(action(990001), ctx)).rejects.toThrow(
      /unsupported quote: gas estimation or final effect validation failed: the gateway could not price this cross-chain transaction/,
    );
  });

  it("keeps fees the action set, without asking", async () => {
    const asked = gatewayAnswering({
      gas: "0x1",
      maxFeePerGas: "0x1",
      maxPriorityFeePerGas: "0x1",
    });
    const { ctx, sent } = makeCtx();
    await handlers.transaction(
      action(990001, { maxFeePerGas: 7n, maxPriorityFeePerGas: 3n }),
      ctx,
    );
    expect(asked).to.have.lengthOf(0);
    expect(sent[0].maxFeePerGas).to.equal(7n);
  });

  it("does not ask on a chain without a gateway", async () => {
    const asked = gatewayAnswering({
      gas: "0x1",
      maxFeePerGas: "0x1",
      maxPriorityFeePerGas: "0x1",
    });
    const { ctx, sent } = makeCtx();
    await handlers.transaction(action(1), ctx);
    expect(asked).to.have.lengthOf(0);
    expect(sent[0].maxFeePerGas).to.equal(undefined);
  });
});
