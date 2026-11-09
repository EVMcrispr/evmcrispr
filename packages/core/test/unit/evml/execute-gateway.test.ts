import { afterEach, expect as bunExpect, describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { chainGateway, registerChains } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";
import { ModuleRegistry } from "../../../src/evml/registry";
import { collectScriptUsage } from "../../../src/scriptUsage";

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
    gatewayFor: chainGateway,
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

  it("does not use a quote that commits the transaction to more than the chain's ceiling", async () => {
    // 400k gas at 1 gwei (1.25 with headroom) is 0.0005: under the default
    // ceiling of 0.01. At 100 gwei it is over.
    gatewayAnswering({
      gas: "0x61a80",
      maxFeePerGas: "0x174876e800",
      maxPriorityFeePerGas: "0x174876e800",
    });
    const { ctx, sent } = makeCtx();
    await handlers.transaction(action(990001), ctx);
    expect(sent[0].maxFeePerGas).to.equal(undefined);
    expect(sent[0].maxPriorityFeePerGas).to.equal(undefined);
  });

  it("does not let a quote raise the gas the transaction set", async () => {
    gatewayAnswering({
      gas: "0x7a120",
      maxFeePerGas: "0x10",
      maxPriorityFeePerGas: "0x8",
    });
    const { ctx, sent } = makeCtx();
    await handlers.transaction(action(990001), ctx);
    expect(sent[0].gas).to.equal(400_000n);
    expect(sent[0].maxFeePerGas).to.equal(undefined);
  });

  it("asks no gateway unless the run grants one", async () => {
    const asked = gatewayAnswering({
      gas: "0x61a80",
      maxFeePerGas: "0x10",
      maxPriorityFeePerGas: "0x8",
    });
    const { ctx, sent } = makeCtx();
    await makeDefaultHandlers({
      account: FROM,
      maximizeGasLimit: false,
    }).transaction(action(990001), ctx);
    expect(asked).to.have.lengthOf(0);
    expect(sent[0].maxFeePerGas).to.equal(undefined);
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

describe("evml > execute > which runs a gateway serves", () => {
  it("knows the module that declared each gateway", () => {
    const registry = new ModuleRegistry();
    registry.register(
      "gatewaymod",
      async () => ({}) as never,
      undefined,
      false,
      [
        {
          id: 990003,
          key: "gatewayOwned",
          name: "Gateway Owned",
          rpcUrl: "https://rpc.example/3",
          gateway: "https://gateway.example/3",
        },
        {
          id: 990004,
          key: "gatewayless",
          name: "Gatewayless",
          rpcUrl: "https://rpc.example/4",
        },
      ],
    );
    expect(registry.gatewayModule(990003)).to.equal("gatewaymod");
    expect(registry.gatewayModule(990004)).to.equal(undefined);
  });

  it("reads the modules a script loads, under their canonical names", () => {
    const usage = collectScriptUsage("load eez\nload token>tk\nprint 1");
    expect([...(usage?.loaded ?? [])].sort()).to.eql(["eez", "token"]);
    expect([...(collectScriptUsage("print 1")?.loaded ?? [])]).to.eql([]);
  });
});
