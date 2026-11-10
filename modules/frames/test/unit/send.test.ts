import "../setup";
import { describe, expect, test } from "bun:test";
import type { ModuleActionSendCtx } from "@evmcrispr/sdk";
import { ethrexHegotaDevnetProfile } from "@evmcrispr/viem-frames";
import { custom, type Hash, type Transport, type WalletClient } from "viem";
import { frameAction } from "../../src/actions";
import type { FrameModuleAction } from "../../src/frame-action";
import {
  ACCOUNT,
  accountAction,
  frameGateway,
  frameNode,
  frameWallet,
  metaMask,
  OWNER,
  plainAction,
} from "../helpers/frame-gateway";

const HINT =
  "Send from a frame account with `--account`, or connect a wallet that signs frame transactions (the test wallet, experimental)";

/** The context core gives a module action's `send`; the alt-mempool
 *  gateway is the run's transport for its chain. */
function ctx(
  wallet: WalletClient,
  gateway: Transport,
  transports: Record<number, Transport> = { 1337: gateway },
) {
  const logs: string[] = [];
  const sent: Hash[] = [];
  const value = {
    walletClient: wallet,
    getPublicClient: () => {
      throw new Error("not used");
    },
    transports,
    onLog: (line: string) => logs.push(line),
    onSent: (hash: Hash) => sent.push(hash),
  } as ModuleActionSendCtx;
  return { ctx: value, logs, sent };
}

const send = (action: FrameModuleAction, ctx: ModuleActionSendCtx) =>
  frameAction.send(action, ctx);

describe("the frames module sends its frame action", () => {
  test("routes an account frame action to the wallet-signed sender", async () => {
    const gateway = frameGateway();
    const mm = metaMask();
    const c = ctx(mm.wallet, gateway.transport);
    await send(accountAction(), c.ctx);

    const typed = mm.asked.filter((r) => r.method === "eth_signTypedData_v4");
    expect(typed).toHaveLength(1);
    const [signer, data] = typed[0].params;
    expect(signer.toLowerCase()).toBe(OWNER.address.toLowerCase());
    expect(JSON.parse(data)).toMatchObject({
      domain: {
        name: "EVMcrispr Frame Account",
        version: "1",
        chainId: 1337,
        verifyingContract: ACCOUNT.toLowerCase(),
      },
      primaryType: "FrameTransaction",
    });
    // Sent through the gateway, under the hash the run is told of.
    expect(
      gateway.calls.filter((x) => x.method === "eth_sendFrameTransaction"),
    ).toHaveLength(1);
    expect(c.sent).toEqual([gateway.sent()!]);
    // Asked of the wallet: its chain, and the one signature.
    expect(
      mm.asked.filter((r) => !/^eth_(chainId|accounts)$/.test(r.method)),
    ).toHaveLength(1);
  });

  test("asks a plain sender's wallet eth_signTransaction and sends its transaction", async () => {
    const gateway = frameGateway();
    const fw = frameWallet();
    const c = ctx(fw.wallet, gateway.transport);
    await send(plainAction(), c.ctx);
    const asked = fw.asked.filter((r) => r.method === "eth_signTransaction");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.params[0]).toMatchObject({
      type: "0x6",
      chainId: "0x539",
      from: OWNER.address,
      nonce: "0x3",
    });
    expect(
      gateway.calls.filter((x) => x.method === "eth_sendFrameTransaction"),
    ).toHaveLength(1);
    expect(c.sent).toEqual([gateway.sent()!]);
  });

  test("a wallet that cannot sign frame transactions: its error, with the hint", async () => {
    const gateway = frameGateway();
    const fw = frameWallet({ refuses: "eth_signTransaction is not supported" });
    const c = ctx(fw.wallet, gateway.transport);
    const error = await send(plainAction(), c.ctx).catch((e: Error) => e);
    expect((error as Error).message).toStartWith(
      "The wallet did not sign the frame transaction: ",
    );
    expect((error as Error).message).toContain(
      "eth_signTransaction is not supported",
    );
    expect((error as Error).message).toEndWith(`. ${HINT}`);
    expect(
      gateway.calls.filter((x) => x.method === "eth_sendFrameTransaction"),
    ).toHaveLength(0);
  });

  test("a plain sender's call without --gas stops before the wallet is asked", async () => {
    const gateway = frameGateway();
    const fw = frameWallet();
    const c = ctx(fw.wallet, gateway.transport);
    const action = plainAction();
    action.data.frames[1] = { ...action.data.frames[1]!, gas: undefined };
    await expect(send(action, c.ctx)).rejects.toThrow(
      "Frame 2 has no gas limit: give its exec or send --gas (frames are not sized yet)",
    );
    expect(fw.asked).toHaveLength(0);
    expect(gateway.calls).toHaveLength(0);
  });

  test("a chain outside the frame networks is refused by name, for both senders", async () => {
    for (const action of [
      plainAction({ chainId: 100 }),
      accountAction({ chainId: 100 }),
    ]) {
      const gateway = frameGateway();
      const fw = frameWallet({ chainId: 100 });
      const c = ctx(fw.wallet, gateway.transport);
      await expect(send(action, c.ctx)).rejects.toThrow(
        "Frame transactions are sent on the Alt-mempool devnet, the Frames quick devnet, the Frames mining devnet, the Frames alt-mempool devnet or the Hegota devnet, not on Gnosis",
      );
      expect(fw.asked).toHaveLength(0);
    }
  });

  test("the alt mempool on a network without one is refused", async () => {
    const node = frameNode({ chainId: 81412 });
    const fw = frameWallet({ chainId: 81412 });
    const c = ctx(fw.wallet, node.transport, { 81412: node.transport });
    await expect(send(plainAction({ chainId: 81412 }), c.ctx)).rejects.toThrow(
      "The Frames mining devnet has no alt mempool: write `--mempool canonical`",
    );
    expect(fw.asked).toHaveLength(0);
  });

  test("a local devnet goes to the host's transport; the quick devnet is not waited on", async () => {
    const node = frameNode({ chainId: 81411, mines: false });
    const fw = frameWallet({ chainId: 81411 });
    const c = ctx(fw.wallet, node.transport, { 81411: node.transport });
    const result = await send(
      plainAction({ chainId: 81411, mempool: "canonical" }),
      c.ctx,
    );
    // Admitted, never mined: the run records it as queued, not confirmed.
    expect(result).toEqual({
      status: "queued",
      reason: "Admitted; the Frames quick devnet never mines",
      transactionHash: node.sent(),
    });
    expect(
      node.calls.filter((x) => x.method === "eth_sendRawTransaction"),
    ).toHaveLength(1);
    expect(
      node.calls.filter((x) => x.method === "eth_getTransactionReceipt"),
    ).toHaveLength(0);
    expect(c.sent).toEqual([node.sent()!]);
    expect(c.logs.join("\n")).toContain(
      "The Frames quick devnet never mines: the transaction is not waited on",
    );
  });

  test("an account's transaction on the mining devnet is sent to its node", async () => {
    const node = frameNode({ chainId: 81412 });
    const code = custom({
      request: (args: { method: string; params: any }) =>
        args.method === "eth_getCode"
          ? Promise.resolve("0x6001")
          : node.transport({}).request(args as never),
    });
    const mm = metaMask({ chainId: 81412 });
    const c = ctx(mm.wallet, code, { 81412: code });
    await send(accountAction({ chainId: 81412, mempool: "canonical" }), c.ctx);
    expect(
      node.calls.filter((x) => x.method === "eth_sendRawTransaction"),
    ).toHaveLength(1);
    expect(c.sent).toEqual([node.sent()!]);
  });

  test("a wallet on another chain is told to switch altMempoolDevnet first, and nothing is signed", async () => {
    const gateway = frameGateway();
    const mm = metaMask({ chainId: 100 });
    const c = ctx(mm.wallet, gateway.transport);
    await expect(send(accountAction(), c.ctx)).rejects.toThrow(
      /switch altMempoolDevnet/,
    );
    expect(mm.asked.map((r) => r.method)).toEqual(["eth_chainId"]);
    expect(gateway.calls).toHaveLength(0);
  });

  test("a transaction signed after Cancel is not submitted", async () => {
    const gateway = frameGateway();
    const abort = new AbortController();
    const mm = metaMask({
      sign: async (typed) => {
        const signature = await OWNER.signTypedData(typed);
        // The user cancels the run while the wallet's prompt is open.
        abort.abort();
        return signature;
      },
    });
    const c = ctx(mm.wallet, gateway.transport);
    await expect(
      send(accountAction(), { ...c.ctx, signal: abort.signal }),
    ).rejects.toThrow(/cancelled/);
    expect(
      mm.asked.filter((r) => r.method === "eth_signTypedData_v4"),
    ).toHaveLength(1);
    expect(
      gateway.calls.filter((x) => x.method === "eth_sendFrameTransaction"),
    ).toHaveLength(0);
    expect(c.sent).toHaveLength(0);
  });

  test("without a connected wallet it says so, before anything", async () => {
    const gateway = frameGateway();
    const c = ctx(undefined as unknown as WalletClient, gateway.transport);
    await expect(send(accountAction(), c.ctx)).rejects.toThrow(
      /No wallet is connected/,
    );
    expect(gateway.calls).toHaveLength(0);
  });

  describe("on the Hegota devnet, whose mempool rules the fork checks", () => {
    const HEGOTA = 3151908;
    const sends = (node: ReturnType<typeof frameNode>) =>
      node.calls.filter((c) => c.method === "eth_sendRawTransaction").length;
    const asked = (node: ReturnType<typeof frameNode>) =>
      node.calls.some((c) => c.method === "ethrex_simulateFrameTransaction");

    test("the node is asked first; a transaction it says its mempool refuses is not sent", async () => {
      const node = frameNode({
        chainId: HEGOTA,
        verdict: { valid: false, violation: "BannedOpcode(66)" },
      });
      const fw = frameWallet({
        chainId: HEGOTA,
        profile: ethrexHegotaDevnetProfile,
      });
      const c = ctx(fw.wallet, node.transport, { [HEGOTA]: node.transport });
      const error = await send(
        plainAction({ chainId: HEGOTA, mempool: "canonical" }),
        c.ctx,
      ).catch((e: Error) => e);
      expect((error as Error).message).toMatch(
        /^The Hegota devnet's node says its mempool would refuse 0x[0-9a-f]{64}: BannedOpcode\(66\)\. Nothing was sent$/,
      );
      expect(sends(node)).toBe(0);
    });

    test("one it admits is sent", async () => {
      const node = frameNode({ chainId: HEGOTA, verdict: { valid: true } });
      const fw = frameWallet({
        chainId: HEGOTA,
        profile: ethrexHegotaDevnetProfile,
      });
      const c = ctx(fw.wallet, node.transport, { [HEGOTA]: node.transport });
      await send(plainAction({ chainId: HEGOTA, mempool: "canonical" }), c.ctx);
      expect(asked(node)).toBe(true);
      expect(sends(node)).toBe(1);
    });

    test("elsewhere the node is not asked", async () => {
      const node = frameNode({
        chainId: 81412,
        verdict: { valid: false, violation: "x" },
      });
      const fw = frameWallet({ chainId: 81412 });
      const c = ctx(fw.wallet, node.transport, { 81412: node.transport });
      await send(plainAction({ chainId: 81412, mempool: "canonical" }), c.ctx);
      expect(asked(node)).toBe(false);
      expect(sends(node)).toBe(1);
    });
  });

  describe("a post-verify transaction", () => {
    const HEGOTA = 3151908;
    const withCheck = () =>
      plainAction({
        chainId: HEGOTA,
        mempool: "canonical",
        frames: [
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
            target: ACCOUNT,
            data: "0x",
            value: 1n,
            gas: 50_000n,
            stateGas: 200_000n,
          },
          {
            mode: "postTx",
            target: ACCOUNT,
            data: "0x",
            value: 0n,
            gas: 50_000n,
            stateGas: 0n,
          },
        ],
      });

    test("whose check failed on the chain is reported as failed, naming the check", async () => {
      const node = frameNode({
        chainId: HEGOTA,
        status: "0x0",
        frameStatuses: ["0x1", "0x1", "0x0"],
      });
      const fw = frameWallet({
        chainId: HEGOTA,
        profile: ethrexHegotaDevnetProfile,
      });
      const c = ctx(fw.wallet, node.transport, { [HEGOTA]: node.transport });
      const error = await send(withCheck(), c.ctx).catch((e: Error) => e);
      expect((error as Error).message).toBe(
        `A post-verify check failed: post-verify frame 3 reverted, so the transaction's body was reverted (${node.sent()})`,
      );
    });

    test("whose checks held is reported as the receipt", async () => {
      const node = frameNode({
        chainId: HEGOTA,
        frameStatuses: ["0x1", "0x1", "0x1"],
      });
      const fw = frameWallet({
        chainId: HEGOTA,
        profile: ethrexHegotaDevnetProfile,
      });
      const c = ctx(fw.wallet, node.transport, { [HEGOTA]: node.transport });
      const receipt = (await send(withCheck(), c.ctx)) as { status: string };
      expect(receipt.status).toBe("success");
    });
  });
});
