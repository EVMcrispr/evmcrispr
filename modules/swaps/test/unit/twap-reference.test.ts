import "../setup";
import { afterEach, describe, expect, it } from "bun:test";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import type { PublicClient } from "viem";
import {
  BaseError,
  ContractFunctionExecutionError,
  encodeAbiParameters,
  encodeEventTopics,
  padHex,
  zeroHash,
} from "viem";
import {
  COMPOSABLE_COW,
  cowAbi,
  cowTwap,
  orderHash,
  paramsAbi,
} from "../../src/twap/cow";
import { findReference } from "../../src/twap/reference";
import { server } from "../setup";

afterEach(() => server.resetHandlers());

const receiver = "0x1111111111111111111111111111111111111111";
const params = cowTwap.buildParams(
  {
    sellToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    buyToken: "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
    receiver,
    partSellAmount: 4n * 10n ** 18n,
    minPartLimit: 1n,
    t0: 0n,
    n: 3n,
    t: 3600n,
    span: 0n,
    appData: zeroHash,
  },
  padHex("0x1234", { size: 32 }),
);
const hash = orderHash(params);

const encodeCreated = (owner: `0x${string}`) => ({
  topics: encodeEventTopics({
    abi: cowAbi,
    eventName: "ConditionalOrderCreated",
    args: { owner },
  }),
  data: encodeAbiParameters(paramsAbi, [params]),
});

/** A chain with no registrations: every lookup must come back empty. */
function emptyChain(calls: string[] = []) {
  return {
    getBlock: async () => ({ number: 100_000n }),
    getLogs: async ({ fromBlock }: { fromBlock: bigint }) => {
      calls.push(`logs:${fromBlock}`);
      return [];
    },
    getTransactionReceipt: async () => {
      calls.push("receipt");
      return { status: "success", logs: [] };
    },
  } as unknown as PublicClient;
}

const indexed = (items: unknown[]) =>
  server.use(
    http.post("https://programmatic-orders.cow.fi/graphql", () =>
      HttpResponse.json({ data: { programmaticOrders: { items } } }),
    ),
  );

describe("TWAP > order hash resolution", () => {
  it("takes only an order hash", async () => {
    for (const order of [JSON.stringify({ orderHash: hash }), "0x1234", 42])
      await expect(findReference(emptyChain(), 100, order)).rejects.toThrow(
        "pass the order hash bound by swaps:twap",
      );
    await expect(findReference(emptyChain(), 10, hash)).rejects.toThrow(
      "not available",
    );
  });

  it("ignores an indexer row its receipt does not confirm, then scans recent blocks", async () => {
    indexed([
      {
        owner: receiver,
        ...params,
        hash,
        txHash: `0x${"ab".repeat(32)}`,
      },
    ]);
    const calls: string[] = [];
    await expect(findReference(emptyChain(calls), 42161, hash)).rejects.toThrow(
      "CoW's order indexer does not list it and it was not registered in about the last six hours of blocks",
    );
    // Newest page first, down to the six-hour floor and no further.
    expect(calls[0]).toBe("receipt");
    expect(calls[1]).toBe("logs:95001");
    expect(calls.at(-1)).toBe("logs:13600");
    expect(calls).toHaveLength(19);
  });

  it("names a verified order that another app's account registered", async () => {
    const txHash = `0x${"ab".repeat(32)}` as const;
    indexed([{ owner: receiver, ...params, hash, txHash }]);
    const chain = {
      ...emptyChain(),
      // The receipt confirms the row, but the owner is not a Safe.
      getTransactionReceipt: async () => ({
        status: "success",
        logs: [
          {
            address: COMPOSABLE_COW,
            ...encodeCreated(receiver),
          },
        ],
      }),
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "getOwners")
          throw new ContractFunctionExecutionError(new BaseError("revert"), {
            abi: [],
            functionName,
          });
        return "0x";
      },
    } as unknown as PublicClient;
    await expect(findReference(chain, 100, hash)).rejects.toThrow(
      `TWAP order ${hash} exists, but TWAP account ${receiver} was not created by swaps:twap`,
    );
  });

  it("skips indexer rows whose params do not hash to the order", async () => {
    indexed([
      {
        owner: receiver,
        ...params,
        salt: zeroHash,
        hash,
        txHash: `0x${"ab".repeat(32)}`,
      },
    ]);
    const calls: string[] = [];
    await expect(findReference(emptyChain(calls), 100, hash)).rejects.toThrow(
      "does not list it",
    );
    expect(calls).not.toContain("receipt");
  });

  it("falls back to recent blocks while the indexer is down", async () => {
    server.use(
      http.post(
        "https://programmatic-orders.cow.fi/graphql",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    await expect(findReference(emptyChain(), 100, hash)).rejects.toThrow(
      "CoW's order indexer was unavailable",
    );
  });

  it("never calls the indexer when external reads are off", async () => {
    let called = false;
    server.use(
      http.post("https://programmatic-orders.cow.fi/graphql", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    await expect(
      findReference(emptyChain(), 100, hash, { external: false }),
    ).rejects.toThrow("CoW's order indexer was skipped");
    expect(called).toBe(false);
  });
});
