import { describe, expect, test } from "bun:test";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { decodeTx, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import { custom, defineChain, type Hex, keccak256 } from "viem";
import {
  type FrameSpecLike,
  FrameTransactionDroppedError,
  FrameTransactionRefusedError,
  hegotaDevnet,
  sendFrameTransactionWithArbitrarySignature,
  toFrameRequests,
} from "../../src";

const ACCOUNT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const SPONSOR = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";

/** A contract sender's check, a paymaster's, then one call. */
const FRAMES: FrameSpecLike[] = [
  {
    mode: "verify",
    approve: "execution",
    target: null,
    data: "0xb22253510000000000000000000000000000000000000000000000000000000000000002",
    value: 0n,
    gas: 40_000n,
  },
  {
    mode: "verify",
    approve: "payment",
    target: SPONSOR,
    data: "0xfc735e99",
    value: 0n,
    gas: 50_000n,
  },
  {
    mode: "sender",
    target: RECIPIENT,
    data: "0xd09de08a",
    value: 0n,
    gas: 50_000n,
    stateGas: 200_000n,
  },
];

const RECEIPT = (hash: Hex) => ({
  type: "0x6",
  status: "0x1",
  blockHash: `0x${"11".repeat(32)}`,
  blockNumber: "0x10",
  transactionHash: hash,
  transactionIndex: "0x0",
  from: ACCOUNT,
  to: null,
  cumulativeGasUsed: "0x52fe",
  gasUsed: "0x52fe",
  effectiveGasPrice: "0x7",
  contractAddress: null,
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  payer: SPONSOR,
  frameReceipts: [
    { status: "0x1", gasUsed: "0x0", stateGasUsed: "0x0", logs: [] },
    { status: "0x1", gasUsed: "0x0", stateGasUsed: "0x0", logs: [] },
    { status: "0x1", gasUsed: "0x10", stateGasUsed: "0x0", logs: [] },
  ],
});

/**
 * The gateway stand-in. `send` answers `eth_sendFrameTransaction` from the
 * wire transaction it was given (by default: its true hash).
 */
function gateway({
  code = "0x6000",
  send,
  mined = true,
  dropped = false,
  held = 0,
  verdict,
  fees = { maxFeePerGas: "0x77359400", maxPriorityFeePerGas: "0x3b9aca00" },
}: {
  code?: Hex | (() => never);
  send?: (wire: any) => unknown;
  mined?: boolean;
  /** Admitted, then gone: no receipt and no transaction. A number: only
   *  that many submissions are dropped, the next is mined. */
  dropped?: boolean | number;
  /** Polls before the node knows the transaction and mines it (an alt
   *  mempool still holding it). */
  held?: number;
  fees?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  /** What `ethrex_simulateFrameTransaction` answers; without it the node
   *  does not serve the method. */
  verdict?: { valid: boolean; violation?: string };
} = {}) {
  const calls: { method: string; params: any }[] = [];
  let sentHash: Hex | undefined;
  let byHash = 0;
  let submissions = 0;
  const droppedNow = () =>
    dropped === true || (typeof dropped === "number" && submissions <= dropped);
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x539";
        case "eth_blockNumber":
          return "0x10";
        case "eth_getTransactionCount":
          return "0x7";
        case "eth_getCode":
          return typeof code === "function" ? code() : code;
        case "skandha_getGasPrice":
          return fees;
        case "eth_sendFrameTransaction": {
          submissions++;
          byHash = 0;
          if (send) return send(params[0]);
          sentHash = txHash(profile, fromWire(params[0]));
          return sentHash;
        }
        case "eth_sendRawTransaction":
          sentHash = keccak256(params[0]);
          return sentHash;
        case "skandha_frameTransactionStatus":
          return { status: "Pending" };
        case "ethrex_simulateFrameTransaction":
          if (!verdict) throw new Error("the method does not exist");
          return verdict;
        case "eth_getTransactionReceipt":
          if (held > 0) return null;
          return mined && !droppedNow() && sentHash ? RECEIPT(sentHash) : null;
        case "eth_getTransactionByHash":
          if (held > 0) {
            held--;
            return null;
          }
          // Dropped: the node had it once, then lost it.
          if (droppedNow() && byHash++ > 0) return null;
          return { hash: sentHash };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls, methods: () => calls.map((c) => c.method) };
}

/** The library's transaction back from the wire JSON. */
function fromWire(wire: any) {
  return newTx({
    chainId: BigInt(wire.chainId),
    sender: wire.sender,
    nonceSeq: BigInt(wire.nonceSeq ?? wire.nonce),
    nonceKeys: wire.nonceKeys?.map(BigInt),
    frames: wire.frames.map((f: any) => ({
      mode: Number(f.mode),
      flags: Number(f.flags),
      target: f.target,
      limits: {
        execution: BigInt(f.limits.execution),
        state: BigInt(f.limits.state),
      },
      value: BigInt(f.value),
      data: f.data,
    })),
    signatures: wire.signatures.map((s: any) => ({
      scheme: Number(s.scheme),
      signer: s.signer,
      msg: s.msg,
      signature: s.signature,
    })),
    fees: {
      maxFeePerGas: BigInt(wire.maxFeePerGas ?? wire.fees.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(
        wire.maxPriorityFeePerGas ?? wire.fees.maxPriorityFeePerGas,
      ),
    },
  });
}

/** A frame chain other than the alt-mempool devnet: a node, no sidecar. */
const LOCAL = defineChain({
  id: 3151908,
  name: "Local frame devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:32003"] } },
});

/** A plain node: fees come from its blocks; it has no skandha_* methods. */
function node(receipt: (hash: Hex) => unknown = RECEIPT) {
  const calls: { method: string; params: any }[] = [];
  let sentHash: Hex | undefined;
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x301824";
        case "eth_blockNumber":
          return "0x10";
        case "eth_getTransactionCount":
          return "0x7";
        case "eth_getCode":
          return "0x6000";
        case "eth_getBlockByNumber":
          return {
            number: "0x10",
            hash: `0x${"22".repeat(32)}`,
            baseFeePerGas: "0x3b9aca00",
            timestamp: "0x1",
            transactions: [],
          };
        case "eth_maxPriorityFeePerGas":
          return "0x5f5e100";
        case "eth_sendRawTransaction":
          sentHash = keccak256(params[0]);
          return sentHash;
        case "eth_getTransactionReceipt":
          return sentHash ? receipt(sentHash) : null;
        case "eth_getTransactionByHash":
          return { hash: sentHash };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls, methods: () => calls.map((c) => c.method) };
}

const send = (
  g: ReturnType<typeof gateway>,
  extra: Partial<
    Parameters<typeof sendFrameTransactionWithArbitrarySignature>[0]
  > = {},
) =>
  sendFrameTransactionWithArbitrarySignature({
    sender: ACCOUNT,
    frames: FRAMES,
    mempool: "alt",
    transport: g.transport,
    sign: async () => "0xabcdef",
    ...extra,
  });

describe("a transaction the node dropped", () => {
  test("is not one the node has not seen yet (an alt mempool holding it)", async () => {
    const g = gateway({ held: 3 });
    const result = await send(g, { receiptTimeoutMs: 60_000 });
    expect(result.receipt?.status).toBe("success");
  }, 40_000);

  test("is submitted again, the same bytes, when the node drops it", async () => {
    const g = gateway({ dropped: 1 });
    const lines: [string, string][] = [];
    const result = await send(g, {
      receiptTimeoutMs: 60_000,
      onLog: (line, level) => lines.push([level, line]),
    });
    expect(result.receipt?.status).toBe("success");
    const sent = g.calls.filter((c) => c.method === "eth_sendFrameTransaction");
    expect(sent).toHaveLength(2);
    expect(sent[1]!.params).toEqual(sent[0]!.params);
    expect(lines).toContainEqual([
      "warning",
      `${result.hash} was dropped unmined: submitting the same signed transaction again (1 of 2)`,
    ]);
  }, 40_000);

  test("is reported as dropped once its resends are dropped too, not waited on until the timeout", async () => {
    const g = gateway({ dropped: true });
    const started = Date.now();
    const error = await send(g, { receiptTimeoutMs: 60_000, resends: 1 }).catch(
      (e: unknown) => e,
    );
    expect(
      g.calls.filter((c) => c.method === "eth_sendFrameTransaction"),
    ).toHaveLength(2);
    expect(error).toBeInstanceOf(FrameTransactionDroppedError);
    expect((error as FrameTransactionDroppedError).hash).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
    expect((error as Error).message).toBe(
      `${(error as FrameTransactionDroppedError).hash} was dropped: the node no longer has it and it was not mined`,
    );
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 40_000);
});

describe("asking the node before sending (preflight)", () => {
  const sends = (g: ReturnType<typeof gateway>) =>
    g.methods().filter((m) => m === "eth_sendRawTransaction").length;

  test("a transaction the node says its mempool admits is sent", async () => {
    const g = gateway({ verdict: { valid: true } });
    const result = await send(g, { mempool: "canonical", preflight: true });
    expect(result.receipt?.status).toBe("success");
    const asked = g.calls.find(
      (c) => c.method === "ethrex_simulateFrameTransaction",
    );
    // The same signed bytes that are then sent.
    expect(asked?.params[0]).toBe(
      g.calls.find((c) => c.method === "eth_sendRawTransaction")?.params[0],
    );
    expect(sends(g)).toBe(1);
  });

  test("one it says its mempool refuses is not sent, and says why", async () => {
    const g = gateway({
      verdict: { valid: false, violation: "StorageReadNonSender" },
    });
    const error = await send(g, {
      mempool: "canonical",
      preflight: true,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FrameTransactionRefusedError);
    expect((error as Error).message).toMatch(
      /^The .+'s node says its mempool would refuse 0x[0-9a-f]{64}: StorageReadNonSender\. Nothing was sent$/,
    );
    expect(sends(g)).toBe(0);
  });

  test("a node that does not answer is warned about, and the transaction sent", async () => {
    const g = gateway();
    const lines: [string, string][] = [];
    await send(g, {
      mempool: "canonical",
      preflight: true,
      onLog: (line, level) => lines.push([level, line]),
    });
    expect(sends(g)).toBe(1);
    expect(
      lines.some(
        ([level, line]) =>
          level === "warning" &&
          line.includes("did not say whether its mempool admits"),
      ),
    ).toBe(true);
  });

  test("the alt mempool and a send without it are not asked", async () => {
    for (const extra of [
      { mempool: "alt" as const, preflight: true },
      { mempool: "canonical" as const },
    ]) {
      const g = gateway({ verdict: { valid: false, violation: "x" } });
      await send(g, extra);
      expect(g.methods()).not.toContain("ethrex_simulateFrameTransaction");
    }
  });
});

describe("sendFrameTransactionWithArbitrarySignature", () => {
  test("signs the transaction's signature hash and sends the bytes in an ARBITRARY entry", async () => {
    const g = gateway();
    const asked: Hex[] = [];
    const lines: [string, string][] = [];
    const { hash, receipt } = await send(g, {
      sign: async (h) => {
        asked.push(h);
        return "0xabcdef";
      },
      onLog: (line, level) => lines.push([line, level]),
    });

    const [wire] = g.calls.find(
      (c) => c.method === "eth_sendFrameTransaction",
    )!.params;
    const sent = fromWire(wire);
    expect(sent.sender).toBe(ACCOUNT);
    expect(sent.nonceSeq).toBe(7n);
    expect(sent.frames).toEqual(toFrameRequests(FRAMES) as typeof sent.frames);
    // Any bytes: what they mean is the sender's code's business.
    expect(sent.signatures).toHaveLength(1);
    expect(sent.signatures[0]!.scheme).toBe(0);
    expect(sent.signatures[0]!.signature).toBe("0xabcdef");
    // `sign` was given the hash of the transaction with those bytes elided.
    expect(asked).toEqual([sigHash(profile, sent)]);
    expect(hash).toBe(txHash(profile, sent));
    expect(receipt?.payer).toBe(SPONSOR);
    // Plain lines with a level; how they look is the caller's.
    expect(lines[0]![1]).toBe("info");
    expect(lines.some(([l, v]) => v === "success" && l.includes(hash))).toBe(
      true,
    );
    expect(lines.every(([l]) => !/^:\w+:/.test(l))).toBe(true);
  });

  test("refuses a sender without code, before signing", async () => {
    const g = gateway({ code: "0x" });
    let signed = false;
    await expect(
      send(g, {
        sign: async () => {
          signed = true;
          return "0x";
        },
      }),
    ).rejects.toThrow(/has no code .* nothing to check an ARBITRARY signature/);
    expect(signed).toBe(false);
  });

  test("refuses frames without limits, before any request", async () => {
    const g = gateway();
    const noState = FRAMES.map((f, i) =>
      i === 2 ? { ...f, stateGas: undefined } : f,
    );
    await expect(send(g, { frames: noState })).rejects.toThrow(
      /Frame 3 has no `stateGas`/,
    );
    expect(g.methods()).toEqual([]);
  });

  test("passes the signer's error on unchanged, and sends nothing", async () => {
    const g = gateway();
    const refusal = new Error("the signer said no");
    await expect(
      send(g, {
        sign: async () => {
          throw refusal;
        },
      }),
    ).rejects.toBe(refusal);
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("refuses a signature that is not hex", async () => {
    const g = gateway();
    await expect(send(g, { sign: async () => "nope" as Hex })).rejects.toThrow(
      /The signature is not hex/,
    );
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("sends nothing when cancelled while signing", async () => {
    const g = gateway();
    const controller = new AbortController();
    await expect(
      send(g, {
        signal: controller.signal,
        sign: async () => {
          controller.abort();
          return "0xab";
        },
      }),
    ).rejects.toThrow(/nothing was sent/);
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("sends the raw bytes for the canonical mempool", async () => {
    const g = gateway();
    await send(g, { mempool: "canonical" });
    expect(g.methods()).toContain("eth_sendRawTransaction");
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("sends on another frame chain through the canonical mempool, fees from the node", async () => {
    const n = node();
    const { hash } = await sendFrameTransactionWithArbitrarySignature({
      sender: ACCOUNT,
      frames: FRAMES,
      mempool: "canonical",
      chain: LOCAL,
      transport: n.transport,
      sign: async () => "0xabcdef",
    });
    const raw = n.calls.find((c) => c.method === "eth_sendRawTransaction")!
      .params[0] as Hex;
    const sent = decodeTx(profile, raw);
    expect(sent.chainId).toBe(3151908n);
    expect(hash).toBe(keccak256(raw));
    // viem's EIP-1559 estimate from the node: 1.2 × the base fee plus the
    // node's priority fee.
    expect(sent.fees.maxPriorityFeePerGas).toBe(100_000_000n);
    expect(sent.fees.maxFeePerGas).toBe(1_200_000_000n + 100_000_000n);
    expect(n.methods().some((m) => m.startsWith("skandha_"))).toBe(false);
  });

  test("says which frames a failed POST_TX frame rolled back, though their receipts read success", async () => {
    const n = node((hash) => ({
      ...RECEIPT(hash),
      status: "0x0",
      frameReceipts: [
        ...RECEIPT(hash).frameReceipts,
        { status: "0x0", gasUsed: "0x10", stateGasUsed: "0x0", logs: [] },
      ],
    }));
    const lines: [string, string][] = [];
    await sendFrameTransactionWithArbitrarySignature({
      sender: ACCOUNT,
      frames: [
        ...FRAMES,
        {
          mode: "postTx",
          target: RECIPIENT,
          data: "0x",
          value: 0n,
          gas: 50_000n,
          stateGas: 0n,
        },
      ],
      mempool: "canonical",
      // The Hegota devnet's client, the one that runs POST_TX frames.
      chain: hegotaDevnet,
      transport: n.transport,
      sign: async () => "0xabcdef",
      onLog: (line, level) => lines.push([line, level]),
    });
    expect(lines.filter(([line]) => /^Frame \d/.test(line))).toEqual([
      ["Frame 1: success", "success"],
      ["Frame 2: success", "success"],
      [
        "Frame 3: success, then rolled back (a POST_TX frame reverted)",
        "warning",
      ],
      ["Frame 4: reverted", "warning"],
    ]);
  });

  test("reads frame receipts on a chain not wrapped by withFrames", async () => {
    const n = node();
    const levels: string[] = [];
    const { receipt } = await sendFrameTransactionWithArbitrarySignature({
      sender: ACCOUNT,
      frames: FRAMES,
      mempool: "canonical",
      chain: LOCAL,
      transport: n.transport,
      sign: async () => "0xabcdef",
      onLog: (_line, level) => levels.push(level),
    });
    expect(receipt?.payer).toBe(SPONSOR);
    expect(receipt?.frameReceipts?.map((f) => f.status)).toEqual([
      "success",
      "success",
      "success",
    ]);
    expect(levels.filter((l) => l === "warning")).toEqual([]);
  });
});
