import { describe, expect, test } from "bun:test";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import {
  createWalletClient,
  custom,
  type Hex,
  isAddressEqual,
  keccak256,
  recoverTypedDataAddress,
  size,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  describeAccountFrameTransaction,
  FRAME_ACCOUNT_DOMAIN_NAME,
  type FrameSpecLike,
  frameAccountTypedData,
  sendAccountFrameTransaction,
  toFrameRequests,
} from "../../src";

// Anvil's accounts #0 (the owner) and #1 (someone else).
const OWNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const STRANGER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const owner = privateKeyToAccount(OWNER_KEY);
const stranger = privateKeyToAccount(STRANGER_KEY);
const ACCOUNT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const SPONSOR = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";

/** As frame:tx --account lays them out: the account's check, the sponsor's, the call. */
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
  fees = { maxFeePerGas: "0x77359400", maxPriorityFeePerGas: "0x3b9aca00" },
}: {
  code?: Hex | (() => never);
  send?: (wire: any) => unknown;
  mined?: boolean;
  fees?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
} = {}) {
  const calls: { method: string; params: any }[] = [];
  let sentHash: Hex | undefined;
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
          if (send) return send(params[0]);
          sentHash = txHash(profile, fromWire(params[0]));
          return sentHash;
        }
        case "eth_sendRawTransaction":
          sentHash = keccak256(params[0]);
          return sentHash;
        case "skandha_frameTransactionStatus":
          return { status: "Pending" };
        case "eth_getTransactionReceipt":
          return mined && sentHash ? RECEIPT(sentHash) : null;
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

/** The transport a wallet should never touch: nonce, code, fees and sending go to the gateway. */
const noWalletRpc = custom({
  async request({ method }: { method: string }) {
    throw new Error(`the wallet's RPC was asked ${method}`);
  },
});

/** A local-account wallet standing in for MetaMask, recording what it is asked to sign. */
function wallet(key: Hex = OWNER_KEY) {
  const client = createWalletClient({
    account: privateKeyToAccount(key),
    transport: noWalletRpc,
  });
  const asked: any[] = [];
  const sign = client.signTypedData.bind(client);
  client.signTypedData = (async (args: any) => {
    asked.push(args);
    return sign(args);
  }) as typeof client.signTypedData;
  return { client: client as WalletClient, asked };
}

/** A JSON-RPC wallet (MetaMask's shape): eth_accounts and eth_signTypedData_v4. */
function jsonRpcWallet(key: Hex = OWNER_KEY, answer?: (sig: Hex) => unknown) {
  const signer = privateKeyToAccount(key);
  const asked: any[] = [];
  const client = createWalletClient({
    transport: custom({
      async request({ method, params }: { method: string; params: any }) {
        switch (method) {
          case "eth_accounts":
          case "eth_requestAccounts":
            return [signer.address];
          case "eth_signTypedData_v4": {
            const typed = JSON.parse(params[1]);
            asked.push({ address: params[0], typed });
            const { EIP712Domain: _, ...types } = typed.types;
            const signature = await signer.signTypedData({
              domain: typed.domain,
              types,
              primaryType: typed.primaryType,
              message: typed.message,
            });
            return answer ? answer(signature) : signature;
          }
          default:
            throw new Error(`the wallet's RPC was asked ${method}`);
        }
      },
    }),
  });
  return { client: client as WalletClient, asked };
}

const send = (
  w: WalletClient,
  g: ReturnType<typeof gateway>,
  extra: Partial<Parameters<typeof sendAccountFrameTransaction>[0]> = {},
) =>
  sendAccountFrameTransaction({
    wallet: w,
    account: ACCOUNT,
    owner: owner.address,
    frames: FRAMES,
    mempool: "alt",
    transport: g.transport,
    ...extra,
  });

describe("frameAccountTypedData", () => {
  test("names the account, the devnet and the signature hash", () => {
    const hash = `0x${"ab".repeat(32)}` as Hex;
    expect(frameAccountTypedData(ACCOUNT, hash)).toEqual({
      domain: {
        name: "EVMcrispr Frame Account",
        version: "1",
        chainId: 1337,
        verifyingContract: ACCOUNT,
      },
      types: { FrameTransaction: [{ name: "sigHash", type: "bytes32" }] },
      primaryType: "FrameTransaction",
      message: { sigHash: hash },
    });
    expect(FRAME_ACCOUNT_DOMAIN_NAME).toBe("EVMcrispr Frame Account");
  });
});

describe("signWith", () => {
  test("wraps exactly the one signature with the full description", async () => {
    const g = gateway();
    const w = wallet();
    const seen: string[] = [];
    let during = 0;
    let inside = 0;
    await send(w.client, g, {
      signWith: async (description, sign) => {
        seen.push(description);
        inside = w.asked.length;
        const out = await sign();
        during = w.asked.length;
        return out;
      },
    });
    expect(seen).toHaveLength(1);
    expect([inside, during]).toEqual([0, 1]);
    const d = seen[0]!;
    expect(d).toContain(ACCOUNT);
    expect(d).toContain("Frame 1: verify approving execution");
    expect(d).toContain("selector 0xb2225351");
    expect(d).toContain(`Frame 2: verify approving payment to ${SPONSOR}`);
    expect(d).toContain(`Frame 3: sender to ${RECIPIENT}`);
    expect(d).toContain("selector 0xd09de08a");
    expect(d).toContain(`Paid by the sponsor ${SPONSOR}`);
    expect(d).toContain("Nonce 7");
    expect(d).toContain("max fee 2 gwei");
    expect(d).toContain("priority 1)");
    expect(d).toContain(w.asked[0].message.sigHash);
  });

  test("describes a paying account and escapes values", () => {
    const d = describeAccountFrameTransaction({
      account: ACCOUNT,
      frames: [{ ...FRAMES[0]!, approve: "both" }],
      requests: toFrameRequests([{ ...FRAMES[0]!, approve: "both" }]),
      nonce: 1,
      fees: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      sigHash: "0x1b[2K" as Hex,
    });
    expect(d).toContain(`Paid by the account ${ACCOUNT}`);
    expect(d).not.toContain("\x1b");
  });
});

describe("sendAccountFrameTransaction", () => {
  test("asks the wallet for the frame account typed data and sends it in an ARBITRARY entry", async () => {
    const g = gateway();
    const w = wallet();
    const logs: string[] = [];
    const { hash, receipt } = await send(w.client, g, {
      onLog: (l) => logs.push(l),
    });

    const [wire] = g.calls.find(
      (c) => c.method === "eth_sendFrameTransaction",
    )!.params;
    const sent = fromWire(wire);
    // The frames signed are the frames given, with the account's nonce and the sidecar's fees.
    expect(sent.sender).toBe(ACCOUNT);
    expect(sent.chainId).toBe(1337n);
    expect(sent.nonceSeq).toBe(7n);
    expect(sent.fees.maxFeePerGas).toBe(2_000_000_000n);
    expect(sent.fees.maxPriorityFeePerGas).toBe(1_000_000_000n);
    expect(sent.frames).toEqual(toFrameRequests(FRAMES) as typeof sent.frames);

    // One ARBITRARY entry: scheme 0, no signer, no msg, the 65-byte signature.
    expect(sent.signatures).toHaveLength(1);
    const [entry] = sent.signatures;
    expect(entry!.scheme).toBe(0);
    expect(entry!.signer).toBe("0x");
    expect(entry!.msg).toBe("0x");
    expect(size(entry!.signature)).toBe(65);

    // The wallet was asked exactly the typed data over this transaction's signature hash.
    const unsigned = {
      ...sent,
      signatures: [{ ...entry!, signature: "0x" as Hex }],
    };
    const expectedSigHash = sigHash(profile, unsigned);
    expect(sigHash(profile, sent)).toBe(expectedSigHash);
    expect(w.asked).toHaveLength(1);
    const { account: askedAccount, ...typedData } = w.asked[0];
    expect(
      isAddressEqual(askedAccount.address ?? askedAccount, owner.address),
    ).toBe(true);
    expect(typedData).toEqual(frameAccountTypedData(ACCOUNT, expectedSigHash));
    expect(
      await recoverTypedDataAddress({
        ...frameAccountTypedData(ACCOUNT, expectedSigHash),
        signature: entry!.signature,
      }),
    ).toBe(owner.address);

    // The hash returned is the transaction's own, and the receipt was waited for.
    expect(hash).toBe(txHash(profile, sent));
    expect(receipt?.transactionHash).toBe(hash);
    expect(receipt?.payer).toBe(SPONSOR);
    expect(receipt?.frameReceipts).toHaveLength(3);
    expect(logs.some((l) => l.includes(hash) && l.includes("admitted"))).toBe(
      true,
    );
    // Nothing was asked of the wallet's own RPC (it throws).
    expect(g.methods()).toContain("eth_getCode");
  });

  test("works with a JSON-RPC wallet (eth_signTypedData_v4)", async () => {
    const g = gateway();
    const w = jsonRpcWallet();
    const { hash } = await send(w.client, g);
    expect(w.asked).toHaveLength(1);
    expect(w.asked[0].typed.primaryType).toBe("FrameTransaction");
    expect(
      isAddressEqual(w.asked[0].typed.domain.verifyingContract, ACCOUNT),
    ).toBe(true);
    const [wire] = g.calls.find(
      (c) => c.method === "eth_sendFrameTransaction",
    )!.params;
    expect(hash).toBe(txHash(profile, fromWire(wire)));
  });

  test("refuses when the wallet is not the account's owner, before signing", async () => {
    const g = gateway();
    const w = wallet(STRANGER_KEY);
    await expect(send(w.client, g)).rejects.toThrow(owner.address);
    await expect(send(w.client, g)).rejects.toThrow(stranger.address);
    expect(w.asked).toHaveLength(0);
    expect(g.methods()).toEqual([]);
  });

  test("refuses a signature that does not recover to the owner", async () => {
    const g = gateway();
    // The wallet claims the owner's address but another key signs.
    const w = jsonRpcWallet(OWNER_KEY, () => {
      throw new Error("unused");
    });
    const otherSigner = privateKeyToAccount(STRANGER_KEY);
    w.client.signTypedData = (async (args: any) => {
      const { account: _, ...typed } = args;
      return otherSigner.signTypedData(typed);
    }) as typeof w.client.signTypedData;
    await expect(send(w.client, g)).rejects.toThrow(/not signed by the owner/);
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("refuses a signature that is not 65 bytes", async () => {
    const g = gateway();
    const w = jsonRpcWallet(OWNER_KEY, () => "0x1234\u001b[2J");
    await expect(send(w.client, g)).rejects.toThrow(/65-byte signature/);
    expect(g.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("refuses an account with no code", async () => {
    const g = gateway({ code: "0x" });
    const w = wallet();
    await expect(send(w.client, g)).rejects.toThrow(/no code/);
    await expect(send(w.client, g)).rejects.toThrow(ACCOUNT);
    expect(w.asked).toHaveLength(0);
  });

  test("escapes the gateway's error when it cannot read the account's code", async () => {
    const g = gateway({
      code: () => {
        throw Object.assign(new Error("boom\u001b[2J\u202e"), {
          code: -32000,
        });
      },
    });
    const w = wallet();
    const error = (await send(w.client, g).catch((e) => e)) as Error;
    expect(error.message).toContain("boom");
    expect(error.message).toContain("\\x1b[2J\\u202e");
    expect(error.message).not.toContain("\u001b");
    expect(error.message).not.toContain("\u202e");
    expect(w.asked).toHaveLength(0);
  });

  test("shows the fees and the most the transaction can cost before signing", async () => {
    const g = gateway();
    const w = wallet();
    const logs: string[] = [];
    let askedAfterFees = false;
    const sign = w.client.signTypedData;
    w.client.signTypedData = (async (args: any) => {
      askedAfterFees = logs.some((l) => l.startsWith("Fees:"));
      return sign(args);
    }) as typeof sign;
    await send(w.client, g, { onLog: (l) => logs.push(l) });
    // 40k + 50k + 50k execution + 200k state = 340k gas at 2 gwei.
    expect(logs).toContain(
      `Fees: max 2 gwei per gas (priority 1); at most 0.00068 ETH for 340000 gas, paid by the sponsor ${SPONSOR}`,
    );
    expect(askedAfterFees).toBe(true);
  });

  test("refuses fees above the cap, without asking the wallet", async () => {
    const w = wallet();
    const high = gateway({
      fees: { maxFeePerGas: "0x2540be401", maxPriorityFeePerGas: "0x1" },
    });
    await expect(send(w.client, high)).rejects.toThrow(
      /maxFeePerGas of 10.000000001 gwei, above the cap of 10 gwei/,
    );
    const highTip = gateway({
      fees: { maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x3b9aca01" },
    });
    await expect(
      send(w.client, highTip, { maxFeePerGasCap: 1_000_000_000n }),
    ).rejects.toThrow(/maxPriorityFeePerGas .* above the cap of 1 gwei/);
    expect(w.asked).toHaveLength(0);
    expect(high.methods()).not.toContain("eth_sendFrameTransaction");
  });

  test("refuses frames without limits", async () => {
    const g = gateway();
    const w = wallet();
    const noGas = FRAMES.map((f, i) =>
      i === 2 ? { ...f, gas: undefined } : f,
    );
    await expect(send(w.client, g, { frames: noGas })).rejects.toThrow(
      /Frame 3 has no gas limit: add --gas/,
    );
    const noState = FRAMES.map((f, i) =>
      i === 2 ? { ...f, stateGas: undefined } : f,
    );
    await expect(send(w.client, g, { frames: noState })).rejects.toThrow(
      /Frame 3 has no state gas limit: add --state-gas/,
    );
    const noVerifyGas = FRAMES.map((f, i) =>
      i === 0 ? { ...f, gas: undefined } : f,
    );
    await expect(send(w.client, g, { frames: noVerifyGas })).rejects.toThrow(
      /Frame 1 .*--gas/,
    );
    expect(w.asked).toHaveLength(0);
    expect(g.methods()).toEqual([]);
  });

  test("shows the mempool's refusal for an unfunded sponsor", async () => {
    const g = gateway({
      send: () => {
        throw Object.assign(
          new Error("payer has insufficient balance\u001b[2J\u202e"),
          { code: -32000 },
        );
      },
    });
    const w = wallet();
    const error = (await send(w.client, g).catch((e) => e)) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("insufficient balance");
    expect(error.message).toContain(SPONSOR);
    expect(error.message).toContain("\\x1b[2J");
    expect(error.message).not.toContain("\u001b");
    expect(error.message).not.toContain("\u202e");
  });

  test("refuses a returned hash other than its own, and escapes it", async () => {
    const g = gateway({ send: () => "0xdead\u001b[2J" });
    const w = wallet();
    const error = (await send(w.client, g).catch((e) => e)) as Error;
    expect(error.message).toMatch(/returned/);
    expect(error.message).not.toContain("\u001b");
  });

  test("sends the raw bytes for the canonical mempool", async () => {
    const g = gateway();
    const w = wallet();
    const { hash } = await send(w.client, g, { mempool: "canonical" });
    const [raw] = g.calls.find(
      (c) => c.method === "eth_sendRawTransaction",
    )!.params;
    expect(hash).toBe(keccak256(raw));
    expect(raw.startsWith("0x06")).toBe(true);
  });

  test("stops when the transaction is admitted but not mined", async () => {
    const g = gateway({ mined: false });
    const w = wallet();
    await expect(send(w.client, g, { receiptTimeoutMs: 50 })).rejects.toThrow(
      /admitted but not mined/,
    );
  });
});
