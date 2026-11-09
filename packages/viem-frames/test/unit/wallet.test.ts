import { describe, expect, test } from "bun:test";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import {
  decodeTx,
  encodeTx,
  type FrameTx,
  newTx,
  secp256k1Placeholder,
  signTx,
  txHash,
} from "@forshtat/hegota-support/tx";
import {
  concat,
  createWalletClient,
  custom,
  type Hex,
  keccak256,
  numberToHex,
  slice,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type FrameSpecLike,
  FrameWalletError,
  formatFrameTransactionRequest,
  parseFrameTransactionRequest,
  sendFrameTransactionFromWallet,
  toFrameRequests,
} from "../../src";

// Anvil's #0 as the sender, #1 as someone else.
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const OTHER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const SENDER = privateKeyToAccount(KEY).address;
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const FRAMES: FrameSpecLike[] = [
  {
    mode: "verify",
    approve: "both",
    target: null,
    data: "0x",
    value: 0n,
    gas: 30_000n,
  },
  {
    mode: "sender",
    target: RECIPIENT,
    data: "0xd09de08a",
    value: 1_000n,
    gas: 50_000n,
    stateGas: 200_000n,
    atomic: false,
  },
];

const unsignedOf = (nonce = 7n): FrameTx =>
  newTx({
    chainId: 1337,
    sender: SENDER,
    nonceSeq: nonce,
    frames: toFrameRequests(FRAMES, profile) as never,
    signatures: [secp256k1Placeholder(profile)],
    fees: {
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    },
  });

/** A wallet that signs type-0x06 requests with `key`, after `tamper`. */
function wallet({
  key = KEY,
  account = SENDER,
  tamper,
  refuse,
  answer,
}: {
  key?: Hex;
  account?: `0x${string}`;
  tamper?: (tx: FrameTx) => FrameTx;
  refuse?: string;
  answer?: (raw: Hex) => unknown;
} = {}) {
  const asked: { method: string; params: any }[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      asked.push({ method, params });
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account];
        case "eth_chainId":
          return "0x539";
        case "eth_signTransaction": {
          if (refuse) throw new Error(refuse);
          let tx = parseFrameTransactionRequest(params[0], profile);
          if (tamper) tx = tamper(tx);
          const raw = encodeTx(profile, await signTx(profile, tx, key));
          return answer ? answer(raw) : raw;
        }
        default:
          throw new Error(`unexpected wallet ${method}`);
      }
    },
  });
  return { wallet: createWalletClient({ transport }), asked };
}

/** The gateway: a sidecar on chain 1337. */
function gateway({ mined = true }: { mined?: boolean } = {}) {
  const calls: { method: string; params: any }[] = [];
  let sent: Hex | undefined;
  const transport = custom({
    async request({ method, params }: { method: string; params: any }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_chainId":
          return "0x539";
        case "eth_getTransactionCount":
          return "0x7";
        case "skandha_getGasPrice":
          return {
            maxFeePerGas: "0x77359400",
            maxPriorityFeePerGas: "0x3b9aca00",
          };
        case "eth_sendFrameTransaction":
          sent = txHash(
            profile,
            newTx({
              chainId: BigInt(params[0].chainId),
              sender: params[0].sender,
              nonceSeq: BigInt(params[0].nonceSeq),
              frames: params[0].frames.map((f: any) => ({
                mode: f.mode,
                flags: f.flags,
                target: f.target,
                limits: {
                  execution: BigInt(f.limits.execution),
                  state: BigInt(f.limits.state),
                },
                value: BigInt(f.value),
                data: f.data,
              })),
              signatures: params[0].signatures,
              fees: {
                maxFeePerGas: BigInt(params[0].fees.maxFeePerGas),
                maxPriorityFeePerGas: BigInt(
                  params[0].fees.maxPriorityFeePerGas,
                ),
              },
            }),
          );
          return sent;
        case "eth_sendRawTransaction":
          sent = keccak256(params[0]);
          return sent;
        case "skandha_frameTransactionStatus":
          return { status: "Pending" };
        case "eth_getTransactionReceipt":
          return mined && sent
            ? {
                type: "0x6",
                status: "0x1",
                blockHash: `0x${"11".repeat(32)}`,
                blockNumber: "0x10",
                transactionHash: sent,
                transactionIndex: "0x0",
                from: SENDER,
                to: null,
                cumulativeGasUsed: "0x1",
                gasUsed: "0x1",
                effectiveGasPrice: "0x7",
                contractAddress: null,
                logs: [],
                logsBloom: `0x${"00".repeat(256)}`,
                payer: SENDER,
                frameReceipts: [],
              }
            : null;
        case "eth_blockNumber":
          return "0x10";
        default:
          throw new Error(`unexpected gateway ${method}`);
      }
    },
  });
  return {
    transport,
    calls,
    sends: () =>
      calls.filter(
        (c) =>
          c.method === "eth_sendFrameTransaction" ||
          c.method === "eth_sendRawTransaction",
      ),
  };
}

const send = (
  w: ReturnType<typeof wallet>,
  g: ReturnType<typeof gateway>,
  extra: Partial<Parameters<typeof sendFrameTransactionFromWallet>[0]> = {},
) =>
  sendFrameTransactionFromWallet({
    wallet: w.wallet,
    sender: SENDER,
    frames: FRAMES,
    mempool: "alt",
    transport: g.transport,
    receiptTimeoutMs: 2_000,
    ...extra,
  });

describe("a frame transaction its sender's wallet signs", () => {
  test("format and parse are inverses", () => {
    const tx = unsignedOf();
    tx.frames[1]!.flags |= 4;
    const request = formatFrameTransactionRequest(tx, profile);
    expect(request).toEqual({
      type: "0x6",
      chainId: "0x539",
      from: SENDER,
      nonce: "0x7",
      maxFeePerGas: "0x77359400",
      maxPriorityFeePerGas: "0x3b9aca00",
      frames: [
        {
          mode: numberToHex(tx.frames[0]!.mode),
          flags: numberToHex(tx.frames[0]!.flags),
          target: null,
          gasLimit: "0x7530",
          stateGasLimit: "0x0",
          value: "0x0",
          data: "0x",
        },
        {
          mode: numberToHex(tx.frames[1]!.mode),
          flags: numberToHex(tx.frames[1]!.flags),
          target: RECIPIENT,
          gasLimit: "0xc350",
          stateGasLimit: "0x30d40",
          value: "0x3e8",
          data: "0xd09de08a",
        },
      ],
    });
    expect(parseFrameTransactionRequest(request, profile)).toEqual(tx);
  });

  test("parse refuses a request with a field of the wrong kind", () => {
    const request = formatFrameTransactionRequest(unsignedOf(), profile);
    expect(() =>
      parseFrameTransactionRequest({ ...request, nonce: 7 }, profile),
    ).toThrow("nonce");
    expect(() =>
      parseFrameTransactionRequest(
        { ...request, frames: [{ ...request.frames[0], target: "me" }] },
        profile,
      ),
    ).toThrow("target");
  });

  test("asks eth_signTransaction with the whole transaction, then sends the returned bytes", async () => {
    const w = wallet();
    const g = gateway();
    const { hash, receipt } = await send(w, g);
    const asked = w.asked.filter((a) => a.method === "eth_signTransaction");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.params).toEqual([
      formatFrameTransactionRequest(unsignedOf(), profile),
    ]);
    expect(g.sends().map((s) => s.method)).toEqual([
      "eth_sendFrameTransaction",
    ]);
    expect(receipt?.status).toBe("success");
    expect(hash).toBe(
      txHash(profile, await signTx(profile, unsignedOf(), KEY)),
    );
  });

  test("canonical: the raw bytes the wallet returned", async () => {
    let returned: Hex | undefined;
    const w = wallet({
      answer: (raw) => {
        returned = raw;
        return raw;
      },
    });
    const g = gateway();
    await send(w, g, { mempool: "canonical" });
    expect(g.sends()).toEqual([
      { method: "eth_sendRawTransaction", params: [returned] },
    ]);
  });

  test("refuses a returned transaction that differs from the one asked", async () => {
    const w = wallet({
      tamper: (tx) => ({ ...tx, nonceSeq: tx.nonceSeq + 1n }),
    });
    const g = gateway();
    await expect(send(w, g)).rejects.toThrow(
      "The wallet returned another transaction than the one it was asked to sign: nothing was sent",
    );
    expect(g.sends()).toHaveLength(0);
  });

  test("refuses bytes that are not a frame transaction", async () => {
    const w = wallet({ answer: () => "0x02f8" });
    const g = gateway();
    await expect(send(w, g)).rejects.toThrow(
      "The wallet returned 0x02f8, not a signed frame transaction: nothing was sent",
    );
    expect(g.sends()).toHaveLength(0);
  });

  test("refuses a signature by someone else", async () => {
    const other = privateKeyToAccount(OTHER_KEY).address;
    const w = wallet({ key: OTHER_KEY });
    const g = gateway();
    await expect(send(w, g)).rejects.toThrow(
      `The signature recovers to ${other}, not the sender ${SENDER}: nothing was sent`,
    );
    expect(g.sends()).toHaveLength(0);
  });

  test("refuses a signature that is not in canonical form (high s)", async () => {
    const w = wallet({
      answer: (raw) => {
        const tx = decodeTx(profile, raw);
        const sig = tx.signatures[0]!.signature;
        const v = Number(slice(sig, 0, 1));
        const s = BigInt(slice(sig, 33, 65));
        const flipped = concat([
          numberToHex(1 - v, { size: 1 }),
          slice(sig, 1, 33),
          numberToHex(N - s, { size: 32 }),
        ]);
        return encodeTx(profile, {
          ...tx,
          signatures: [{ ...tx.signatures[0]!, signature: flipped }],
        });
      },
    });
    const g = gateway();
    await expect(send(w, g)).rejects.toThrow("not in canonical form");
    expect(g.sends()).toHaveLength(0);
  });

  test("a wallet's refusal is a FrameWalletError with its text", async () => {
    const w = wallet({
      refuse: "the method eth_signTransaction does not exist",
    });
    const g = gateway();
    const error = await send(w, g).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FrameWalletError);
    expect((error as Error).message).toContain(
      "The wallet did not sign the frame transaction: ",
    );
    expect((error as Error).message).toContain(
      "the method eth_signTransaction does not exist",
    );
    expect(g.sends()).toHaveLength(0);
  });

  test("refuses a wallet whose account is not the sender", async () => {
    const other = privateKeyToAccount(OTHER_KEY).address;
    const w = wallet({ account: other });
    await expect(send(w, gateway())).rejects.toThrow(
      `The connected wallet is ${other}, not the sender ${SENDER}`,
    );
    expect(w.asked.some((a) => a.method === "eth_signTransaction")).toBe(false);
  });

  test("waitForReceipt: false returns after admission", async () => {
    const g = gateway({ mined: false });
    const { hash, receipt } = await send(wallet(), g, {
      waitForReceipt: false,
    });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(receipt).toBeUndefined();
    expect(g.calls.some((c) => c.method === "eth_getTransactionReceipt")).toBe(
      false,
    );
  });
});
