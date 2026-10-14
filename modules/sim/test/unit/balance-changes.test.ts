import { describe, expect, it } from "bun:test";
import { getAddress, type PublicClient } from "viem";
import {
  foldBalanceChanges,
  tracedBalanceChanges,
} from "../../src/lib/balance-changes";

const HASH = `0x${"ab".repeat(32)}` as const;
const A = getAddress("0x00000000000000000000000000000000000a0001");
const B = getAddress("0x00000000000000000000000000000000000a0002");
const MINER = getAddress("0xc014ba5ec014ba5ec014ba5ec014ba5ec014ba5e");

const node = (answer: () => unknown) =>
  ({
    request: async () => answer(),
  }) as unknown as PublicClient;

describe("tracedBalanceChanges", () => {
  it("reads before and after from the node's state diff, leaving out the fee recipient and accounts whose balance did not move", async () => {
    const changes = await tracedBalanceChanges(
      node(() => ({
        pre: {
          [A.toLowerCase()]: { balance: "0x10" },
          [MINER.toLowerCase()]: { balance: "0x0" },
        },
        post: {
          [A.toLowerCase()]: { balance: "0x4", nonce: 1 },
          // New to the state: it had nothing before.
          [B.toLowerCase()]: { balance: "0xc" },
          [MINER.toLowerCase()]: { balance: "0x1" },
          // Only its storage changed.
          "0x00000000000000000000000000000000000a0003": { storage: {} },
        },
      })),
      HASH,
      MINER,
    );
    expect(changes).toEqual([
      { address: A, before: 16n, after: 4n },
      { address: B, before: 0n, after: 12n },
    ]);
  });

  it("is undefined when the node does not trace", async () => {
    expect(
      await tracedBalanceChanges(
        node(() => {
          throw new Error("Method not found");
        }),
        HASH,
        undefined,
      ),
    ).toBeUndefined();
    // An answer that is not a state diff (another tracer's) is not one.
    expect(
      await tracedBalanceChanges(
        node(() => ({ structLogs: [] })),
        HASH,
        undefined,
      ),
    ).toBeUndefined();
  });
});

describe("foldBalanceChanges", () => {
  it("keeps an account's balance before its first change and after its last", () => {
    const run = new Map<`0x${string}`, { before: bigint; after?: bigint }>();
    foldBalanceChanges(run, [{ address: A, before: 10n, after: 7n }]);
    foldBalanceChanges(run, [
      { address: A, before: 7n, after: 0n },
      { address: B, before: 0n, after: 3n },
    ]);
    expect(Object.fromEntries(run)).toEqual({
      [A]: { before: 10n, after: 0n },
      [B]: { before: 0n, after: 3n },
    });
  });
});
