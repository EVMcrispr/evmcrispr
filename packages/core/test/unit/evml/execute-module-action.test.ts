import { beforeEach, describe, expect, it } from "bun:test";
import type { ModuleAction } from "@evmcrispr/sdk";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { http, type WalletClient } from "viem";
import type { ActionHandlerCtx } from "../../../src/evml/execute";
import { makeDefaultHandlers } from "../../../src/evml/execute";
import { createEvml } from "../../../src/evml/tag";
import {
  PROBE_HASH,
  Probe,
  pingAction,
  probeSent,
} from "./fixtures/probe-module";

const wallet = {
  account: { address: TEST_ACCOUNT_ADDRESS },
} as unknown as WalletClient;

const ctx: ActionHandlerCtx = {
  walletClient: wallet,
  getPublicClient: () => ({}) as any,
  onLog: () => {},
  next: async () => undefined,
};

const run = (source: string, handlers = {}) =>
  createEvml({
    account: TEST_ACCOUNT_ADDRESS,
    chainId: 100,
    transports: { 100: http("http://127.0.0.1:1") },
  })
    .use(Probe)
    .script(`load probe\n${source}`)
    .execute(wallet, { prepareChains: false, handlers });

describe("evml > execute > module actions", () => {
  beforeEach(() => {
    probeSent.length = 0;
  });

  it("the module sends its action", async () => {
    const result = await run("probe:ping 7");
    expect(probeSent).toHaveLength(1);
    expect(probeSent[0]!.data.n).toBe(7n);
    expect(result.executed).toHaveLength(1);
    expect(result.executed[0]!.result).toEqual({
      status: "success",
      transactionHash: PROBE_HASH,
      logs: [],
    });
  });

  it("a wrapping handler gates it and passes it on", async () => {
    const seen: string[] = [];
    await run("probe:ping 7", {
      module: async (action: ModuleAction, ctx: ActionHandlerCtx) => {
        seen.push(`gate ${action.module}:${action.kind}`);
        const sent = await ctx.next(action);
        seen.push(`sent ${probeSent.length}`);
        return sent;
      },
    });
    expect(seen).toEqual(["gate probe:ping", "sent 1"]);
  });

  it("a host without the module refuses it by name", async () => {
    const handlers = makeDefaultHandlers({
      account: TEST_ACCOUNT_ADDRESS,
      maximizeGasLimit: false,
    });
    const action = pingAction.create({
      chainId: 100,
      from: TEST_ACCOUNT_ADDRESS,
      data: { n: 1n },
    });
    await expect(handlers.module(action, ctx)).rejects.toThrow(
      'No module "probe" is loaded here to send its ping actions: this host cannot send them',
    );
  });

  it("an unknown kind is refused by name", async () => {
    const action = {
      ...pingAction.create({
        chainId: 100,
        from: TEST_ACCOUNT_ADDRESS,
        data: { n: 1n },
      }),
      kind: "pong",
    };
    await expect(
      run("probe:ping 1", {
        module: (_: ModuleAction, ctx: ActionHandlerCtx) => ctx.next(action),
      }),
    ).rejects.toThrow('The probe module has no "pong" action to send');
  });

  it("$> $tx captures what send returned", async () => {
    const logs: string[] = [];
    await createEvml({
      account: TEST_ACCOUNT_ADDRESS,
      chainId: 100,
      transports: { 100: http("http://127.0.0.1:1") },
      onLog: (message) => logs.push(message),
    })
      .use(Probe)
      .script("load probe\nprobe:ping 7 $> $tx\nprint $tx")
      .execute(wallet, { prepareChains: false });
    expect(logs).toContain(PROBE_HASH);
  });
});
