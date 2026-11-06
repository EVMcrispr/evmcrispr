import { describe, expect, test } from "bun:test";
import type { ActionHandlerCtx } from "@evmcrispr/core";
import type { Action } from "@evmcrispr/sdk";
import type { Hash, WalletClient } from "viem";
import { makeFrameHandler } from "../../src/runs/frame-handler";
import {
  ACCOUNT,
  accountAction,
  frameGateway,
  metaMask,
  OWNER,
} from "../helpers/frame-gateway";

const CORE_REFUSAL =
  "This host cannot send frame transactions (Alt-mempool devnet): use the EVMcrispr CLI with EVMCRISPR_PRIVATE_KEY";

function ctx(wallet: WalletClient) {
  const logs: string[] = [];
  const sent: Hash[] = [];
  const next: Action[] = [];
  const value = {
    walletClient: wallet,
    onLog: (line: string) => logs.push(line),
    onSent: (hash: Hash) => sent.push(hash),
    next: async (action: Action) => {
      next.push(action);
      throw new Error(CORE_REFUSAL);
    },
  } as unknown as ActionHandlerCtx;
  return { ctx: value, logs, sent, next };
}

describe("the terminal's frame handler", () => {
  test("routes an account frame action to the wallet-signed sender", async () => {
    const gateway = frameGateway();
    const mm = metaMask();
    const c = ctx(mm.wallet);
    await makeFrameHandler({ transport: gateway.transport })(
      accountAction(),
      c.ctx,
    );

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
    expect(c.next).toHaveLength(0);
    // Asked of the wallet: its chain, and the one signature.
    expect(
      mm.asked.filter((r) => !/^eth_(chainId|accounts)$/.test(r.method)),
    ).toHaveLength(1);
  });

  test("still refuses a plain frame action", async () => {
    const gateway = frameGateway();
    const mm = metaMask();
    const c = ctx(mm.wallet);
    const plain = accountAction({ account: undefined, from: OWNER.address });
    await expect(
      makeFrameHandler({ transport: gateway.transport })(plain, c.ctx),
    ).rejects.toThrow(CORE_REFUSAL);
    expect(c.next).toEqual([plain]);
    expect(mm.asked).toHaveLength(0);
    expect(gateway.calls).toHaveLength(0);
  });

  test("a wallet on another chain is told to switch 1337 first, and nothing is signed", async () => {
    const gateway = frameGateway();
    const mm = metaMask({ chainId: 100 });
    const c = ctx(mm.wallet);
    await expect(
      makeFrameHandler({ transport: gateway.transport })(
        accountAction(),
        c.ctx,
      ),
    ).rejects.toThrow(/switch 1337/);
    expect(mm.asked.map((r) => r.method)).toEqual(["eth_chainId"]);
    expect(gateway.calls).toHaveLength(0);
  });

  test("an account action for another chain than the devnet's is refused", async () => {
    const gateway = frameGateway();
    const mm = metaMask();
    const c = ctx(mm.wallet);
    await expect(
      makeFrameHandler({ transport: gateway.transport })(
        accountAction({ chainId: 100 }),
        c.ctx,
      ),
    ).rejects.toThrow(/1337/);
    expect(mm.asked).toHaveLength(0);
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
    const c = ctx(mm.wallet);
    await expect(
      makeFrameHandler({ transport: gateway.transport })(accountAction(), {
        ...c.ctx,
        signal: abort.signal,
      }),
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
    const c = ctx(undefined as unknown as WalletClient);
    await expect(
      makeFrameHandler({ transport: gateway.transport })(
        accountAction(),
        c.ctx,
      ),
    ).rejects.toThrow(/No wallet is connected/);
    expect(gateway.calls).toHaveLength(0);
  });
});
