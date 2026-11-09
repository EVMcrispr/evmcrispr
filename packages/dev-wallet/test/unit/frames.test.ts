import { describe, expect, test } from "bun:test";
import {
  formatFrameTransactionRequest,
  eip8141TracerProfile as profile,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import {
  decodeTx,
  newTx,
  secp256k1Placeholder,
  sigHash,
} from "@forshtat/hegota-support/tx";
import {
  custom,
  encodeFunctionData,
  erc20Abi,
  hexToBigInt,
  recoverAddress,
  slice,
} from "viem";
import { createTestWallet, type SigningRequest } from "../../src";

const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

const request = (from: `0x${string}` = ANVIL_0, chainId = 81411) =>
  formatFrameTransactionRequest(
    newTx({
      chainId,
      sender: from,
      nonceSeq: 0n,
      frames: toFrameRequests(
        [
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
            target: TOKEN,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [ANVIL_1, 1_500_000n],
            }),
            value: 0n,
            gas: 50_000n,
            stateGas: 200_000n,
          },
        ],
        profile,
      ) as never,
      signatures: [secp256k1Placeholder(profile)],
      fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n },
    }),
    profile,
  );

/** A quick devnet whose token at TOKEN has 6 decimals and symbol USDC. */
const transport = custom({
  async request({ method, params }: { method: string; params: any }) {
    if (method === "eth_chainId") return "0x13e03";
    if (method === "eth_call") {
      const selector = params[0].data.slice(0, 10);
      if (selector === "0x313ce567") return `0x${"6".padStart(64, "0")}`;
      if (selector === "0x95d89b41")
        return `0x${"20".padStart(64, "0")}${"4".padStart(64, "0")}${Buffer.from("USDC").toString("hex").padEnd(64, "0")}`;
    }
    throw new Error(`unexpected ${method}`);
  },
});

function wallet() {
  const shown: SigningRequest[] = [];
  const w = createTestWallet({
    chains: [
      {
        id: 81411,
        name: "Frames quick devnet",
        rpcUrl: "http://127.0.0.1:8570",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        transport,
      },
    ],
    approve: async (r) => {
      shown.push(r);
      return true;
    },
  });
  return {
    shown,
    ask: (params: unknown) =>
      w.provider.request({
        method: "eth_signTransaction",
        params: [params],
      } as never) as Promise<`0x${string}`>,
  };
}

describe("the test wallet signs frame transactions", () => {
  test("shown frame by frame, signed in canonical form by the sender", async () => {
    const w = wallet();
    const raw = await w.ask(request());
    const model = w.shown[0]!;
    expect(model).toMatchObject({
      kind: "frame-transaction",
      from: ANVIL_0,
      payer: "the sender",
      nonce: 0n,
      chain: { id: 81411, name: "Frames quick devnet" },
    });
    if (model.kind !== "frame-transaction") throw new Error();
    expect(model.frames[0]).toMatchObject({
      mode: "verify",
      gloss: "approves the transaction for the sender",
      scope: "execution and payment",
      target: undefined,
      gas: 30_000n,
    });
    expect(model.frames[1]).toMatchObject({
      mode: "sender",
      gloss: "a call made by the sender",
      target: TOKEN,
      stateGas: 200_000n,
      call: {
        functionName: "transfer",
        sourceLabel: "matches ERC-20",
        args: [
          { name: "recipient", shown: ANVIL_1 },
          { name: "amount", shown: "1.5 USDC" },
        ],
      },
    });
    const tx = decodeTx(profile, raw);
    const sig = tx.signatures[0]!.signature;
    expect(hexToBigInt(slice(sig, 33, 65)) <= N / 2n).toBe(true);
    const unsigned = {
      ...tx,
      signatures: [{ ...tx.signatures[0]!, signature: "0x" as const }],
    };
    expect(model.sigHash).toBe(sigHash(profile, unsigned));
    expect(
      await recoverAddress({
        hash: model.sigHash,
        signature: {
          r: slice(sig, 1, 33),
          s: slice(sig, 33, 65),
          yParity: Number(slice(sig, 0, 1)),
        },
      }),
    ).toBe(ANVIL_0);
  });

  test("a frame transaction from another account is refused", async () => {
    const w = wallet();
    await expect(w.ask(request(ANVIL_1))).rejects.toThrow(
      "is not the selected account",
    );
    expect(w.shown).toHaveLength(0);
  });

  test("one for another chain is refused", async () => {
    const w = wallet();
    await expect(w.ask(request(ANVIL_0, 81412))).rejects.toThrow(
      "for another chain than the Frames quick devnet",
    );
  });

  test("a request that does not read is refused", async () => {
    const w = wallet();
    await expect(
      w.ask({ ...request(), frames: [{ mode: "0x0" }] }),
    ).rejects.toThrow("The frame transaction cannot be read");
    expect(w.shown).toHaveLength(0);
  });

  test("a paymaster that approves payment is the payer, and scopes are named by the profile", async () => {
    const PAYMASTER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
    const w = wallet();
    await w.ask(
      formatFrameTransactionRequest(
        newTx({
          chainId: 81411,
          sender: ANVIL_0,
          nonceSeq: 0n,
          frames: toFrameRequests(
            [
              {
                mode: "verify",
                approve: "execution",
                target: null,
                data: "0x",
                value: 0n,
                gas: 30_000n,
              },
              {
                mode: "verify",
                approve: "payment",
                target: PAYMASTER,
                data: "0x",
                value: 0n,
                gas: 50_000n,
              },
            ],
            profile,
          ) as never,
          signatures: [secp256k1Placeholder(profile)],
          fees: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
        }),
        profile,
      ),
    );
    const model = w.shown[0]!;
    if (model.kind !== "frame-transaction") throw new Error();
    expect(model.payer).toBe(`the paymaster ${PAYMASTER}`);
    expect(model.frames.map((f) => f.scope)).toEqual(["execution", "payment"]);
  });
});
