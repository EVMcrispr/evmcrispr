import { describe, expect, it } from "bun:test";
import type { ActionHandlerCtx } from "@evmcrispr/core";
import type { FrameAction, FrameSpec } from "@evmcrispr/sdk";
import { ATOMIC_BATCH_FLAG } from "@evmcrispr/viem-frames";
import { custom, type Hash, type Hex, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { makeFrameHandler, toFrameRequests } from "../src/lib/frame-handler";
import { confirmingAccount } from "../src/lib/local-signer";

// Anvil's account #1.
const KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";

/** The local key, every signature confirmed (and recorded), and the last
 *  signed bytes, so the sidecar stand-in can answer with their hash. */
function signer() {
  const base = privateKeyToAccount(KEY);
  const confirmed: string[] = [];
  let lastSigned: Hex | undefined;
  const recording = {
    ...base,
    async signTransaction(tx: any, options: any) {
      lastSigned = await base.signTransaction(tx, options);
      return lastSigned;
    },
  } as typeof base;
  const account = confirmingAccount(recording, async (summary) => {
    confirmed.push(summary);
    return true;
  });
  return { account, confirmed, lastSigned: () => lastSigned };
}

/** A sidecar stand-in, as in viem-frames' client tests. */
function sidecar(
  lastSigned: () => Hex | undefined,
  { mined = true }: { mined?: boolean } = {},
) {
  const calls: { method: string; params: any }[] = [];
  let sent: Hash | undefined;
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x539";
        case "eth_blockNumber":
          return "0x10";
        case "eth_getTransactionCount":
          return "0x5";
        case "eth_getCode":
          return "0x";
        case "skandha_getGasPrice":
          return {
            maxFeePerGas: "0x77359400",
            maxPriorityFeePerGas: "0x3b9aca00",
          };
        case "eth_sendFrameTransaction":
          sent = keccak256(lastSigned()!);
          return sent;
        case "skandha_frameTransactionStatus":
          return { tx: sent, status: mined ? "OnChain" : "Pending" };
        case "eth_getTransactionReceipt":
          return mined ? receipt(sent!, params[0]) : null;
        case "eth_getTransactionByHash":
          return null;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls, methods: () => calls.map((c) => c.method) };
}

function receipt(hash: Hash, asked: Hash) {
  const from = privateKeyToAccount(KEY).address;
  return {
    type: "0x6",
    status: "0x1",
    blockHash: `0x${"11".repeat(32)}`,
    blockNumber: "0x10",
    transactionHash: asked ?? hash,
    transactionIndex: "0x0",
    from,
    to: null,
    cumulativeGasUsed: "0x52fe",
    gasUsed: "0x52fe",
    effectiveGasPrice: "0x7",
    contractAddress: null,
    logs: [],
    logsBloom: `0x${"00".repeat(256)}`,
    payer: from,
    frameReceipts: [
      { status: "0x1", gasUsed: "0x0", stateGasUsed: "0x0", logs: [] },
      { status: "0x1", gasUsed: "0x10", stateGasUsed: "0x0", logs: [] },
    ],
  };
}

const VERIFY: FrameSpec = {
  mode: "verify",
  approve: "both",
  target: null,
  data: "0x",
  value: 0n,
  gas: 30_000n,
};
/** A pre_verify: a default frame right before the verify, same target. */
const PRE_VERIFY: FrameSpec = {
  mode: "default",
  target: null,
  data: "0x1234",
  value: 0n,
  gas: 40_000n,
};
const CALL: FrameSpec = {
  mode: "sender",
  target: RECIPIENT,
  data: "0xd09de08a",
  value: 1_000n,
  gas: 50_000n,
  stateGas: 200_000n,
};

function action(frames: FrameSpec[], chainId = 1337): FrameAction {
  return {
    type: "frame",
    chainId,
    from: privateKeyToAccount(KEY).address,
    frames,
    mempool: "alt",
  };
}

function ctx() {
  const logs: string[] = [];
  const sent: Hash[] = [];
  const value = {
    onLog: (line: string) => logs.push(line),
    onSent: (hash: Hash) => sent.push(hash),
  } as unknown as ActionHandlerCtx;
  return { ctx: value, logs, sent };
}

describe("toFrameRequests", () => {
  it("toFrameRequests maps modes, scopes and the atomic flag", () => {
    const requests = toFrameRequests([
      VERIFY,
      { ...VERIFY, approve: "execution", gas: undefined },
      { ...VERIFY, approve: "payment", target: RECIPIENT },
      { ...CALL, atomic: true },
      { mode: "default", target: RECIPIENT, data: "0x", value: 0n, gas: 1n },
    ]);
    expect(requests.map((r) => [r.mode, r.flags])).toEqual([
      [1, 3],
      [1, 2],
      [1, 1],
      [2, ATOMIC_BATCH_FLAG],
      [0, 0],
    ]);
    expect(requests[0]!.limits).toEqual({ execution: 30_000n, state: 0n });
    expect(requests[1]!.limits).toBeUndefined();
    expect(requests[3]).toMatchObject({
      target: RECIPIENT,
      data: "0xd09de08a",
      value: 1_000n,
      limits: { execution: 50_000n, state: 200_000n },
    });
    // A body frame without stateGas is left for sizing.
    expect(requests[4]!.limits).toBeUndefined();
  });

  it("gives a pre_verify frame its own limits: it is in the validation prefix", () => {
    const requests = toFrameRequests([PRE_VERIFY, VERIFY, CALL]);
    expect(requests[0]).toMatchObject({
      mode: 0,
      limits: { execution: 40_000n, state: 0n },
    });
  });
});

/** Stands in for the devnet's ethrex node: each frame used `gasUsed[i]`. */
async function withSimulation(gasUsed: string[], fn: () => Promise<void>) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          executionStatus: "success",
          frames: gasUsed.map((g) => ({ gasUsed: g, succeeded: true })),
        },
      }),
    )) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("the frame handler", () => {
  it("sends an admitted frame transaction to eth_sendFrameTransaction", async () => {
    const s = signer();
    const sc = sidecar(s.lastSigned);
    const c = ctx();
    const handler = makeFrameHandler({
      account: s.account,
      sizeBySimulation: false,
      transport: sc.transport,
    });
    const result = (await handler(action([VERIFY, CALL]), c.ctx)) as any;

    const [wire] = sc.calls.find(
      (x) => x.method === "eth_sendFrameTransaction",
    )!.params;
    expect(wire.frames).toHaveLength(2);
    expect(wire.frames[0]).toMatchObject({
      mode: 1,
      flags: 3,
      target: null,
      data: "0x",
      value: "0x0",
      limits: { execution: "0x7530", state: "0x0" },
    });
    expect(wire.frames[1]).toMatchObject({
      mode: 2,
      flags: 0,
      target: RECIPIENT,
      data: "0xd09de08a",
      value: "0x3e8",
      limits: { execution: "0xc350", state: "0x30d40" },
    });
    const hash = keccak256(s.lastSigned()!);
    expect(c.sent).toEqual([hash]);
    expect(result.transactionHash).toBe(hash);
    // One signature: the transaction as sent, with no provisional label.
    expect(s.confirmed).toHaveLength(1);
    expect(s.confirmed[0]).toStartWith("Sign a frame transaction");
    expect(c.logs.some((l) => l.startsWith(":success:"))).toBe(true);
    expect(c.logs.join("\n")).toContain("OnChain");
    expect(c.logs.join("\n")).toContain("Alt-mempool devnet");
    expect(c.logs.join("\n")).toContain("Frame 2: success");
  });

  it("refuses a chain other than the alt-mempool devnet", async () => {
    const s = signer();
    const sc = sidecar(s.lastSigned);
    const handler = makeFrameHandler({
      account: s.account,
      sizeBySimulation: false,
      transport: sc.transport,
    });
    await expect(
      handler(action([VERIFY, CALL], 100), ctx().ctx),
    ).rejects.toThrow(/Gnosis/);
    expect(s.confirmed).toHaveLength(0);
    expect(sc.calls).toHaveLength(0);
  });

  it("refuses missing limits without --size-by-simulation, before signing", async () => {
    for (const [body, message] of [
      [
        { ...CALL, gas: undefined },
        "Frame 2 has no gas limit: add --gas to it, or run with --size-by-simulation",
      ],
      [
        { ...CALL, stateGas: undefined },
        "Frame 2 has no state gas limit: add --state-gas to frame:tx, or run with --size-by-simulation",
      ],
    ] as const) {
      const s = signer();
      const sc = sidecar(s.lastSigned);
      const handler = makeFrameHandler({
        account: s.account,
        sizeBySimulation: false,
        transport: sc.transport,
      });
      await expect(handler(action([VERIFY, body]), ctx().ctx)).rejects.toThrow(
        message,
      );
      expect(s.confirmed).toHaveLength(0);
      expect(sc.methods()).not.toContain("eth_sendFrameTransaction");
    }
  });

  it("sends a pre_verify frame without state gas, needing no sizing", async () => {
    const s = signer();
    const sc = sidecar(s.lastSigned);
    const handler = makeFrameHandler({
      account: s.account,
      sizeBySimulation: false,
      transport: sc.transport,
    });
    await handler(action([PRE_VERIFY, VERIFY, CALL]), ctx().ctx);
    const [wire] = sc.calls.find(
      (x) => x.method === "eth_sendFrameTransaction",
    )!.params;
    expect(wire.frames[0].limits).toEqual({
      execution: "0x9c40",
      state: "0x0",
    });
    expect(s.confirmed).toHaveLength(1);
  });

  it("refuses a validation frame without gas, even with --size-by-simulation", async () => {
    const s = signer();
    const sc = sidecar(s.lastSigned);
    const handler = makeFrameHandler({
      account: s.account,
      sizeBySimulation: true,
      transport: sc.transport,
    });
    await expect(
      handler(action([{ ...VERIFY, gas: undefined }, CALL]), ctx().ctx),
    ).rejects.toThrow(
      "Frame 1 is in the validation prefix and has no gas limit: add --gas to it",
    );
    expect(s.confirmed).toHaveLength(0);
    expect(sc.calls).toHaveLength(0);
  });

  it("signs the provisional transaction labelled, and the final one as sent", async () => {
    await withSimulation(["0x64", "0xbb8"], async () => {
      const s = signer();
      const sc = sidecar(s.lastSigned);
      const c = ctx();
      const handler = makeFrameHandler({
        account: s.account,
        sizeBySimulation: true,
        transport: sc.transport,
      });
      await handler(
        action([VERIFY, { ...CALL, gas: undefined, stateGas: undefined }]),
        c.ctx,
      );
      expect(s.confirmed).toHaveLength(2);
      expect(s.confirmed[0]).toStartWith(
        "Provisional transaction for gas sizing, sent to https://altmempool.forshtat.com only\nSign a frame transaction",
      );
      expect(s.confirmed[1]).toStartWith("Sign a frame transaction");
      // The final transaction carries the sized limits: 3000 x1.25 + 5000.
      expect(s.confirmed[1]).toContain("limits execution 8750, state 200000");
      const [wire] = sc.calls.find(
        (x) => x.method === "eth_sendFrameTransaction",
      )!.params;
      expect(wire.frames[1].limits).toEqual({
        execution: "0x222e",
        state: "0x30d40",
      });
      expect(c.sent).toEqual([keccak256(s.lastSigned()!)]);
      // No --gas was given, so none was replaced.
      expect(c.logs.join("\n")).not.toContain("was replaced");
    });
  });

  it("with --size-by-simulation, sizes a body frame that has gas but no state gas, and never a prefix frame", async () => {
    await withSimulation(["0x64", "0x64", "0xbb8"], async () => {
      const s = signer();
      const sc = sidecar(s.lastSigned);
      const c = ctx();
      const handler = makeFrameHandler({
        account: s.account,
        sizeBySimulation: true,
        transport: sc.transport,
      });
      await handler(
        action([PRE_VERIFY, VERIFY, { ...CALL, stateGas: undefined }]),
        c.ctx,
      );
      const [wire] = sc.calls.find(
        (x) => x.method === "eth_sendFrameTransaction",
      )!.params;
      // The prefix keeps its own limits.
      expect(wire.frames[0].limits).toEqual({
        execution: "0x9c40",
        state: "0x0",
      });
      expect(wire.frames[1].limits).toEqual({
        execution: "0x7530",
        state: "0x0",
      });
      // The body frame is sized: its --gas 50000 is replaced.
      expect(wire.frames[2].limits).toEqual({
        execution: "0x222e",
        state: "0x30d40",
      });
      expect(c.logs).toContain(
        ":warning:Frame 3's --gas 50000 was replaced by the sized limit 8750 (it had no state gas limit)",
      );
    });
  });

  it("stops the run when the transaction is not mined", async () => {
    const s = signer();
    const sc = sidecar(s.lastSigned, { mined: false });
    const c = ctx();
    const handler = makeFrameHandler({
      account: s.account,
      sizeBySimulation: false,
      receiptTimeoutMs: 50,
      transport: sc.transport,
    });
    const run = handler(action([VERIFY, CALL]), c.ctx);
    await expect(run).rejects.toThrow(/admitted but not mined/);
    await expect(run).rejects.toThrow(
      /\(status Pending\): stopping, since a later transaction from you would reuse its nonce\. https:\/\/explorer\.altmempool\.wtf/,
    );
    expect(c.sent).toHaveLength(1);
  });
});
