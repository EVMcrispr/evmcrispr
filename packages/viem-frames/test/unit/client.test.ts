import { describe, expect, test } from "bun:test";
import { createWalletClient, custom, type Hex, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getTransactionReceipt } from "viem/actions";
import {
  altMempoolActions,
  altMempoolDevnet,
  call,
  parseFrameTransaction,
  selfVerify,
} from "../../src";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const BODY_LIMITS = { execution: "0x5208", state: "0x2cd30" };

/**
 * A sidecar stand-in that records every call. `sendResult` answers
 * `eth_sendFrameTransaction`; `code` is the sender's (a smart account by
 * default, so the sidecar's estimate is used).
 */
function mockSidecar(
  sendResult: () => Hex = () => "0x00",
  code: Hex = "0x6000",
) {
  const calls: { method: string; params: any }[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x539";
        case "eth_getTransactionCount":
          return "0x5";
        case "eth_getCode":
          return code;
        case "skandha_getGasPrice":
          return {
            maxFeePerGas: "0x77359400",
            maxPriorityFeePerGas: "0x3b9aca00",
          };
        case "eth_estimateFrameTransactionGas":
          return {
            frames: params[0].frames.map((f: any, i: number) =>
              i === 0 ? f.limits : BODY_LIMITS,
            ),
            cumulativeGasUsed: "0x1",
            maxFeePerGas: "0x1",
            maxPriorityFeePerGas: "0x1",
          };
        case "eth_sendFrameTransaction":
          return sendResult();
        case "eth_sendRawTransaction":
          return keccak256(params[0]);
        case "eth_getTransactionReceipt":
          return RECEIPT;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  const client = createWalletClient({
    account,
    chain: altMempoolDevnet,
    transport,
  }).extend(altMempoolActions());
  return { client, calls, methods: () => calls.map((c) => c.method) };
}

const frames = [selfVerify(), call({ to: RECIPIENT, value: 1_000_000_000n })];

describe("prepare", () => {
  test("fills nonce, fees and the body frame's limits from the sidecar", async () => {
    const { client } = mockSidecar();
    const prepared = (await client.prepareFrameTransaction({ frames })) as any;
    expect(prepared.type).toBe("frame");
    expect(prepared.chainId).toBe(1337);
    expect(prepared.nonce).toBe(5);
    expect(prepared.maxFeePerGas).toBe(2_000_000_000n);
    expect(prepared.maxPriorityFeePerGas).toBe(1_000_000_000n);
    expect(prepared.frames[0].limits).toEqual({
      execution: 30_000n,
      state: 0n,
    });
    expect(prepared.frames[1].limits).toEqual({
      execution: 21_000n,
      state: 183_600n,
    });
  });

  test("the estimate is sent without signatures and with the prefix's own limits", async () => {
    const { client, calls } = mockSidecar();
    await client.prepareFrameTransaction({ frames });
    const [partial] = calls.find(
      (c) => c.method === "eth_estimateFrameTransactionGas",
    )!.params;
    expect(partial.signatures).toBeUndefined();
    expect(partial.sender).toBe(account.address);
    expect(partial.frames[0].limits).toEqual({
      execution: "0x7530",
      state: "0x0",
    });
  });

  test("skips the estimate when every frame has limits", async () => {
    const { client, methods } = mockSidecar();
    await client.prepareFrameTransaction({
      frames: [selfVerify(), call({ to: RECIPIENT, gas: 1n })],
    });
    expect(methods()).not.toContain("eth_estimateFrameTransactionGas");
  });
});

describe("prepare, for a sender without code", () => {
  test("refuses to size the unlimited frames of a sender without code, and signs nothing", async () => {
    const realFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    try {
      const { client } = mockSidecar(undefined, "0x");
      await expect(client.prepareFrameTransaction({ frames })).rejects.toThrow(
        "give every frame gas and stateGas",
      );
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("needs no sizing when every call has its limits", async () => {
    const { client } = mockSidecar(undefined, "0x");
    const prepared = (await client.prepareFrameTransaction({
      frames: [
        selfVerify(),
        call({ to: RECIPIENT, gas: 50_000n, stateGas: 200_000n }),
      ],
    })) as any;
    expect(prepared.frames[1].limits).toEqual({
      execution: 50_000n,
      state: 200_000n,
    });
  });
});

describe("sendFrameTransaction", () => {
  test("submits the signed transaction to the alt mempool as JSON", async () => {
    const expected = keccak256(
      await mockSidecar().client.signFrameTransaction({ frames }),
    );
    const { client, calls } = mockSidecar(() => expected);
    expect(await client.sendFrameTransaction({ frames })).toBe(expected);
    const [wire] = calls.find(
      (c) => c.method === "eth_sendFrameTransaction",
    )!.params;
    expect(wire.nonceSeq).toBe("0x5");
    expect(wire.frames[1].limits).toEqual(BODY_LIMITS);
    expect(wire.signatures[0].signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  test("refuses a hash that is not the transaction's", async () => {
    const { client } = mockSidecar(() => "0xdead");
    await expect(client.sendFrameTransaction({ frames })).rejects.toThrow(
      "whose hash is",
    );
  });

  test("mempool canonical sends the raw bytes", async () => {
    const { client, calls } = mockSidecar();
    await client.sendFrameTransaction({ frames, mempool: "canonical" });
    const [raw] = calls.find(
      (c) => c.method === "eth_sendRawTransaction",
    )!.params;
    expect(parseFrameTransaction(raw).frames).toHaveLength(2);
  });
});

describe("viem's own sendTransaction", () => {
  test("sends a request with frames as a type 0x06 transaction, without eth_fillTransaction or eth_estimateGas", async () => {
    const { client, calls, methods } = mockSidecar();
    await client.sendTransaction({ frames } as never);
    expect(methods()).not.toContain("eth_fillTransaction");
    expect(methods()).not.toContain("eth_estimateGas");
    const [raw] = calls.find(
      (c) => c.method === "eth_sendRawTransaction",
    )!.params;
    expect(raw.startsWith("0x06")).toBe(true);
    expect(parseFrameTransaction(raw).sender).toBe(account.address);
  });
});

const RECEIPT = {
  type: "0x6",
  status: "0x1",
  blockHash: `0x${"11".repeat(32)}`,
  blockNumber: "0x10",
  transactionHash: `0x${"22".repeat(32)}`,
  transactionIndex: "0x0",
  from: account.address,
  to: null,
  cumulativeGasUsed: "0x52fe",
  gasUsed: "0x52fe",
  effectiveGasPrice: "0x7",
  contractAddress: null,
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  payer: account.address,
  frameReceipts: [
    { status: "0x1", gasUsed: "0x0", stateGasUsed: "0x0", logs: [] },
    { status: "0x2", gasUsed: "0x10", stateGasUsed: "0x2cd30", logs: [] },
  ],
};

describe("receipts", () => {
  test("carry the payer and one receipt per frame", async () => {
    const { client } = mockSidecar();
    const receipt = (await getTransactionReceipt(client, {
      hash: RECEIPT.transactionHash as Hex,
    })) as any;
    expect(receipt.type).toBe("frame");
    expect(receipt.status).toBe("success");
    expect(receipt.payer).toBe(account.address);
    expect(receipt.frameReceipts).toEqual([
      { status: "success", gasUsed: 0n, stateGasUsed: 0n, logs: [] },
      { status: "skipped", gasUsed: 16n, stateGasUsed: 183_600n, logs: [] },
    ]);
  });
});
