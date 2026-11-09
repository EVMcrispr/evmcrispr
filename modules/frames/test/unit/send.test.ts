import "../setup";
import { describe, expect, test } from "bun:test";
import type { ModuleActionSendCtx } from "@evmcrispr/sdk";
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
        "Frame transactions are sent on the Alt-mempool devnet, the Frames quick devnet or the Frames mining devnet, not on Gnosis",
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

  test("a wallet on another chain is told to switch 1337 first, and nothing is signed", async () => {
    const gateway = frameGateway();
    const mm = metaMask({ chainId: 100 });
    const c = ctx(mm.wallet, gateway.transport);
    await expect(send(accountAction(), c.ctx)).rejects.toThrow(/switch 1337/);
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
});
