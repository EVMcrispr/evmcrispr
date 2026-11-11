import { describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { createPublicClient, getAddress, pad } from "viem";
import { createRevmBackend } from "../../src/lib/revm-backend";
import { server } from "../setup";

/**
 * revm against a scripted node: the node lists what a transaction reads
 * (eth_createAccessList), asked when the transaction first meets cold
 * state, and revm fetches it with the next pass. A counter contract two
 * levels deep: it reads slot 1, then the slot whose index slot 1 holds (2),
 * then stores slot 0 plus one. The node answers storage a little late, so
 * the list is in hand before the second pass.
 */
const NODE = "http://revm-prefetch.test/node";
const SENDER = getAddress("0x00000000000000000000000000000000000a11ce");
const COUNTER = getAddress("0x00000000000000000000000000000000c0fe0001");
const COUNTER_CODE = "0x60015454506000546001018060005560005260206000f3";

/** The node: the counter holds `onChain` in slot 0 and 2 in slot 1; it
 *  lists slots 0 to 2 for every transaction; it records each method asked. */
function node(onChain: bigint, listing = true) {
  const asked: string[] = [];
  const answer = ({ id, method, params }: any) => {
    asked.push(method);
    const result = (() => {
      switch (method) {
        case "eth_blockNumber":
          return "0x64";
        case "eth_getBlockByNumber":
          return { number: "0x64", timestamp: "0x1000", hash: pad("0x64") };
        case "eth_getBalance":
          return "0xde0b6b3a7640000";
        case "eth_getTransactionCount":
          return "0x0";
        case "eth_getCode":
          return getAddress(params[0]) === COUNTER ? COUNTER_CODE : "0x";
        case "eth_getStorageAt": {
          if (getAddress(params[0]) !== COUNTER) return pad("0x0");
          const slot = BigInt(params[1]);
          return pad(
            `0x${(slot === 0n ? onChain : slot === 1n ? 2n : 0n).toString(16)}`,
          );
        }
        case "eth_createAccessList":
          return listing
            ? {
                accessList: [
                  {
                    address: COUNTER,
                    storageKeys: [pad("0x0"), pad("0x1"), pad("0x2")],
                  },
                ],
                gasUsed: "0x5208",
              }
            : undefined;
        default:
          return undefined;
      }
    })();
    return result === undefined
      ? {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "method not found" },
        }
      : { jsonrpc: "2.0", id, result };
  };
  server.use(
    http.post(NODE, async ({ request }) => {
      const body = (await request.json()) as any;
      const items = Array.isArray(body) ? body : [body];
      if (items.some((i: any) => i.method === "eth_getStorageAt"))
        await new Promise((r) => setTimeout(r, 30));
      return HttpResponse.json(
        Array.isArray(body) ? body.map(answer) : answer(body),
      );
    }),
  );
  return asked;
}

const bump: Action = { from: SENDER, to: COUNTER, data: "0x" } as Action;

async function slot0(backend: Awaited<ReturnType<typeof createRevmBackend>>) {
  const client = createPublicClient({ transport: backend.transport });
  return BigInt(
    (await client.getStorageAt({ address: COUNTER, slot: "0x0" })) ?? "0x0",
  );
}

describe("revm prefetch", () => {
  it("fetches what the node lists before running the transaction", async () => {
    const asked = node(41n);
    const backend = await createRevmBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(bump);
    expect(asked).toContain("eth_createAccessList");
    expect(await slot0(backend)).toBe(42n);
  });

  it("keeps a slot the run set over the chain's value the node lists", async () => {
    node(41n);
    const backend = await createRevmBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    // The cheat writes slot 0 without fetching it: only the fork's cache
    // knows it, and the prefetch must not overwrite it with 41.
    await backend.handleAction({
      type: "rpc",
      method: "revm_setStorageAt",
      params: [COUNTER, "0x0", pad("0x5")],
    } as unknown as Action);
    await backend.handleAction(bump);
    await backend.handleAction(bump);
    expect(await slot0(backend)).toBe(7n);
  });

  it("does not ask for a list when a transaction meets nothing cold", async () => {
    const asked = node(41n);
    const backend = await createRevmBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(bump);
    await backend.handleAction(bump);
    await backend.handleAction(bump);
    expect(await slot0(backend)).toBe(44n);
    expect(asked.filter((m) => m === "eth_createAccessList")).toHaveLength(1);
  });

  it("runs without a list where the node has none", async () => {
    const asked = node(41n, false);
    const backend = await createRevmBackend({
      upstreamRpcUrl: NODE,
      chainId: 100,
    });
    await backend.handleAction(bump);
    await backend.handleAction(bump);
    expect(await slot0(backend)).toBe(43n);
    // Asked once: a node without the method is not asked again.
    expect(asked.filter((m) => m === "eth_createAccessList")).toHaveLength(1);
  });
});
