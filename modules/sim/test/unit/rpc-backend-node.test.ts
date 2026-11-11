import { describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import {
  type Address,
  createPublicClient,
  getAddress,
  numberToHex,
  pad,
  toEventSelector,
} from "viem";
import { createRpcBackend } from "../../src/lib/rpc-backend";
import { server } from "../setup";

/**
 * The rpc engine against a scripted node: what real nodes answer that the
 * test anvil does not (a node behind a load balancer failing one request,
 * a chain where EIP-7708 is live).
 */
const NODE = "http://rpc-engine.test/node";
const ALICE = getAddress("0x00000000000000000000000000000000000a11ce");
const VAULT = getAddress("0x0000000000000000000000000000000000000b0b");
const READER = "0x00000000000000000000000000000000005e7ea0";
const TRANSFER = toEventSelector(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const transferLog = (
  emitter: string,
  from: Address,
  to: Address,
  value: bigint,
) => ({
  address: emitter,
  topics: [TRANSFER, pad(from), pad(to)],
  data: pad(numberToHex(value)),
});

type Simulate = (blocks: any[]) => unknown;

const TRACED = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const EIP7708 = "0xfffffffffffffffffffffffffffffffffffffffe";
const CODE_READER_AT = "0x00000000000000000000000000000000005e7ea1";
const SLOT_READER = "0x6000355460005260206000f3";

/** A node answering the engine's setup reads and `simulate` for
 *  eth_simulateV1, alone or in a JSON-RPC batch. Records each method asked
 *  and the size of each batch posted. */
function node(simulate: Simulate, delayMs = 0) {
  const calls: string[] = [];
  const posts: number[] = [];
  const answer = (id: unknown, method: string, params: any) => {
    calls.push(method);
    const reply = (body: object) => ({ jsonrpc: "2.0", id, ...body });
    switch (method) {
      case "eth_blockNumber":
        return reply({ result: "0x64" });
      case "eth_getBlockByNumber":
        return reply({ result: { number: "0x64", timestamp: "0x1000" } });
      case "eth_simulateV1": {
        const result = simulate(params[0].blockStateCalls);
        return reply(
          result instanceof Error
            ? { error: { code: -32603, message: result.message } }
            : { result },
        );
      }
      default:
        return reply({ error: { code: -32601, message: "method not found" } });
    }
  };
  server.use(
    http.post(NODE, async ({ request }) => {
      const body = (await request.json()) as any;
      const items = Array.isArray(body) ? body : [body];
      posts.push(items.length);
      if (delayMs && items.some((i: any) => i.method === "eth_simulateV1"))
        await new Promise((r) => setTimeout(r, delayMs));
      const answers = items.map((i: any) => answer(i.id, i.method, i.params));
      return HttpResponse.json(Array.isArray(body) ? answers : answers[0]);
    }),
  );
  return Object.assign(calls, { posts });
}

const ok = (logs: object[] = [], returnData = "0x") => ({
  status: "0x1",
  returnData,
  gasUsed: "0x5208",
  logs,
});
/** Results for every block sent: the last block's calls answered by `last`. */
const results = (blocks: any[], last: (call: any) => object) =>
  blocks.map((b, i) => ({
    calls: b.calls.map((c: any) => (i === blocks.length - 1 ? last(c) : ok())),
  }));

/**
 * A node that keeps native balances (50 for every account to start): a
 * call's value moves, logged from each of `emitters`; the balance reader
 * answers balances, the code reader 0x60, a slot read 0x2a. Records the
 * blocks of every simulation asked.
 */
function chain(emitters: readonly string[], delayMs = 0) {
  const requests: any[][] & { posts?: number[] } = [];
  const asked = node((blocks) => {
    requests.push(blocks);
    const balances = new Map<string, bigint>();
    const balance = (a: string) => balances.get(a.toLowerCase()) ?? 50n;
    return blocks.map((block) => {
      const overrides = block.stateOverrides ?? {};
      for (const [a, o] of Object.entries<any>(overrides))
        if (o.balance) balances.set(a.toLowerCase(), BigInt(o.balance));
      return {
        calls: block.calls.map((c: any) => {
          const to = c.to?.toLowerCase();
          if (to === READER)
            return ok([], pad(numberToHex(balance(`0x${c.data.slice(-40)}`))));
          if (to === CODE_READER_AT) return ok([], "0x60");
          if (overrides[c.to]?.code === SLOT_READER) return ok([], pad("0x2a"));
          const value = c.value ? BigInt(c.value) : 0n;
          if (value === 0n) return ok();
          balances.set(c.from.toLowerCase(), balance(c.from) - value);
          balances.set(to, balance(to) + value);
          return ok(
            emitters.map((e) =>
              transferLog(e, getAddress(c.from), getAddress(c.to), value),
            ),
          );
        }),
      };
    });
  }, delayMs);
  requests.posts = asked.posts;
  return requests as any[][] & { posts: number[] };
}

const send = (value: bigint): Action =>
  ({ from: ALICE, to: VAULT, data: "0x", value }) as Action;

describe("Rpc engine against a node", () => {
  it("asks again when a node fails a simulation another node answers", async () => {
    let failures = 1;
    const calls = node((blocks) => {
      if (failures-- > 0)
        return new Error(
          "Object reference not set to an instance of an object.",
        );
      return results(blocks, () => ok());
    });
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    const receipt = await backend.handleAction({
      from: ALICE,
      to: VAULT,
      data: "0x",
    } as Action);
    expect(receipt!.status).toBe("success");
    expect(calls.filter((m) => m === "eth_simulateV1")).toHaveLength(2);
  });

  it("gives up after a few failures, with the node's words", async () => {
    node(
      () => new Error("Object reference not set to an instance of an object."),
    );
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await expect(
      backend.handleAction({ from: ALICE, to: VAULT, data: "0x" } as Action),
    ).rejects.toThrow("Object reference not set");
  });

  it("does not ask again for a method the node does not offer", async () => {
    let asked = 0;
    server.use(
      http.post(NODE, async ({ request }) => {
        const { id, method } = (await request.json()) as any;
        if (method === "eth_simulateV1") asked++;
        if (method === "eth_blockNumber")
          return HttpResponse.json({ jsonrpc: "2.0", id, result: "0x64" });
        if (method === "eth_getBlockByNumber")
          return HttpResponse.json({
            jsonrpc: "2.0",
            id,
            result: { number: "0x64", timestamp: "0x1000" },
          });
        return HttpResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: "the method eth_simulateV1 does not exist",
          },
        });
      }),
    );
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await expect(
      backend.handleAction({ from: ALICE, to: VAULT, data: "0x" } as Action),
    ).rejects.toThrow("does not offer eth_simulateV1");
    expect(asked).toBe(1);
  });

  // A chain with EIP-7708 live (Sepolia since Amsterdam): the node reports
  // native transfers as the chain's own logs, from 0xff…fe, not as
  // traceTransfers' 0xEeee… logs.
  for (const [kind, emitter] of [
    ["traceTransfers", TRACED],
    ["EIP-7708", EIP7708],
  ] as const) {
    it(`reads native balance changes from ${kind} logs`, async () => {
      chain([emitter]);
      const backend = await createRpcBackend({
        upstreamRpcUrl: NODE,
        chainId: 11155111,
      });
      const receipt = await backend.handleAction(send(7n));
      expect(receipt!.balanceChanges).toEqual([
        { address: ALICE, before: 50n, after: 43n },
        { address: VAULT, before: 50n, after: 57n },
      ]);
      // traceTransfers' logs are the tracer's, never the receipt's; an
      // EIP-7708 log is the chain's own and stays, as a node mines it.
      expect(receipt!.logs.map((l: any) => getAddress(l.address))).toEqual(
        kind === "EIP-7708" ? [getAddress(emitter)] : [],
      );
    });
  }

  it("does not count a transfer twice when a node reports it both ways", async () => {
    chain([TRACED, EIP7708]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 11155111,
    });
    const receipt = await backend.handleAction(send(7n));
    expect(receipt!.balanceChanges).toEqual([
      { address: ALICE, before: 50n, after: 43n },
      { address: VAULT, before: 50n, after: 57n },
    ]);
  });

  it("follows balances through later transactions with one request each", async () => {
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(send(7n));
    const first = requests.length;
    const receipt = await backend.handleAction(send(5n));
    expect(requests.length - first).toBe(1);
    expect(receipt!.balanceChanges).toEqual([
      { address: ALICE, before: 43n, after: 38n },
      { address: VAULT, before: 57n, after: 62n },
    ]);
  });

  it("tops a sender up from the balance it followed, without reading it", async () => {
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(send(40n));
    const first = requests.length;
    // 10 left, 25 sent: topped up to 25 by override, in the same request.
    const receipt = await backend.handleAction(send(25n));
    expect(requests.length - first).toBe(1);
    expect(receipt!.balanceChanges).toEqual([
      { address: ALICE, before: 25n, after: 0n },
      { address: VAULT, before: 90n, after: 115n },
    ]);
  });

  it("knows a balance it was asked for, and reads it no more", async () => {
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    const client = createPublicClient({ transport: backend.transport });
    expect(await client.getBalance({ address: ALICE })).toBe(50n);
    const read = requests.length;
    // The sender's balance before the value is known from that read, and
    // the recipient's comes back with the transaction.
    const receipt = await backend.handleAction(send(7n));
    expect(requests.length - read).toBe(1);
    expect(receipt!.balanceChanges).toEqual([
      { address: ALICE, before: 50n, after: 43n },
      { address: VAULT, before: 50n, after: 57n },
    ]);
  });

  it("asks reads made together in one request, each answered", async () => {
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    const client = createPublicClient({ transport: backend.transport });
    const [alice, vault, code, slot] = await Promise.all([
      client.getBalance({ address: ALICE }),
      client.getBalance({ address: VAULT }),
      client.getCode({ address: VAULT }),
      client.getStorageAt({ address: VAULT, slot: "0x5" }),
    ]);
    expect(requests).toHaveLength(1);
    expect([alice, vault, code, slot]).toEqual([50n, 50n, "0x60", pad("0x2a")]);
  });

  it("answers reads from the history they were asked on, though the run moved on", async () => {
    chain([TRACED], 50);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    const client = createPublicClient({ transport: backend.transport });
    const reads = Promise.all([
      client.getBalance({ address: ALICE }),
      client.getBalance({ address: VAULT }),
    ]);
    // The batch is on its way when a cheat adds a block to the history.
    await new Promise((r) => setTimeout(r, 10));
    await backend.handleAction({
      type: "rpc",
      method: "rpc_setBalance",
      params: [VAULT, "0x99"],
    } as unknown as Action);
    expect(await reads).toEqual([50n, 50n]);
  });

  it("asks each call as a simulation of its own, all in one batch", async () => {
    // A call that writes must not change what another call reads: calls
    // in one block share state, so each has its own simulation.
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    const client = createPublicClient({ transport: backend.transport });
    const [a, b, c, alice] = await Promise.all([
      client.call({ to: VAULT, data: "0x01" }),
      client.call({ to: VAULT, data: "0x02" }),
      client.call({ to: ALICE, data: "0x03" }),
      client.getBalance({ address: ALICE }),
    ]);
    expect([a.data, b.data, c.data, alice]).toEqual([
      undefined,
      undefined,
      undefined,
      50n,
    ]);
    // Four simulations: three calls alone, one for the engine's readers.
    expect(requests).toHaveLength(4);
    const lastBlocks = requests.map((blocks) => blocks.at(-1).calls);
    const callBlocks = lastBlocks.filter(
      (calls) => calls[0].to?.toLowerCase() !== READER,
    );
    expect(callBlocks.map((calls) => calls.length)).toEqual([1, 1, 1]);
    expect(callBlocks.map((calls) => calls[0].data).sort()).toEqual([
      "0x01",
      "0x02",
      "0x03",
    ]);
    // And all in one batch: one round trip.
    expect(requests.posts.filter((n: number) => n > 1)).toEqual([4]);
  });

  it("reads after a time warp at the later time", async () => {
    const requests = chain([TRACED]);
    const backend = await createRpcBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(send(1n));
    await backend.handleAction({
      type: "rpc",
      method: "evm_increaseTime",
      params: ["0xe10"],
    } as unknown as Action);
    const client = createPublicClient({ transport: backend.transport });
    await client.getBalance({ address: ALICE });
    const read = requests.at(-1)!.at(-1);
    // The fork's block is at 0x1000; its next block 12s later, then the warp.
    expect(BigInt(read.blockOverrides.time)).toBeGreaterThanOrEqual(
      0x1000n + 12n + 3600n,
    );
  });
});
