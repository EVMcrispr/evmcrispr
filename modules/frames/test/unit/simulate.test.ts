import "../setup";
import { describe, expect, test } from "bun:test";
import type { ModuleActionSimCtx } from "@evmcrispr/sdk";
import { frameAction } from "../../src/actions";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";

/** A host whose body calls throw on the `failAt`-th call (a lost RPC). */
function fakeHost(failAt?: number) {
  let depth = 0;
  let calls = 0;
  const warm = new Set<string>();
  const nonces = new Map<string, bigint>();
  const log: string[] = [];
  const sim: ModuleActionSimCtx = {
    chainId: 81412,
    blockNumber: 1n,
    timestamp: 1n,
    transactionHash: `0x${"00".repeat(32)}`,
    onLog: (m) => log.push(m),
    async call({ to }) {
      calls++;
      if (calls === failAt) throw new Error("upstream RPC timed out");
      warm.add(to.toLowerCase());
      // The body creates a contract: the sender's nonce moves.
      nonces.set(SENDER, (nonces.get(SENDER) ?? 0n) + 1n);
      return { success: true, returnData: "0x", gasUsed: 21n, logs: [] };
    },
    async checkpoint() {
      depth++;
      log.push(`checkpoint ${depth}`);
    },
    async commit() {
      log.push(`commit ${depth}`);
      depth--;
    },
    async revert() {
      log.push(`revert ${depth}`);
      depth--;
    },
    getNonce: async (a) => nonces.get(a) ?? 0n,
    async setNonce(a, n) {
      nonces.set(a, n);
    },
    getBalance: async () => 0n,
    getCode: async () => "0x",
    isWarm: (a) => warm.has(a.toLowerCase()),
    warm: (a) => warm.add(a.toLowerCase()),
    withOpcodes: (_, run) => run(),
  };
  return { sim, depth: () => depth, log, nonces };
}

const action = (n = 2) =>
  frameAction.create({
    chainId: 81412,
    from: SENDER,
    data: {
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
        ...Array.from({ length: n }, () => ({
          mode: "sender" as const,
          target: DEAD as `0x${string}`,
          data: "0x" as const,
          value: 0n,
          gas: 50_000n,
          stateGas: 200_000n,
        })),
      ],
    },
  });

describe("the frame executor", () => {
  test("an error in the body unwinds every checkpoint it opened", async () => {
    const host = fakeHost(2);
    await expect(frameAction.simulate!(action(), host.sim)).rejects.toThrow(
      "upstream RPC timed out",
    );
    expect(host.depth()).toBe(0);
  });

  test("the sender's nonce is used once, after validation, and its body's CREATEs keep theirs", async () => {
    const host = fakeHost();
    await frameAction.simulate!(action(2), host.sim);
    // One for the transaction, then one per body frame's CREATE (fake).
    expect(host.nonces.get(SENDER)).toBe(3n);
  });

  test("a target warmed by an earlier frame costs 100 to reach, a cold one 3000", async () => {
    const host = fakeHost();
    const receipt = (await frameAction.simulate!(
      action(2),
      host.sim,
    )) as unknown as {
      frameReceipts: { gasUsed: bigint }[];
    };
    expect(receipt.frameReceipts.map((f) => f.gasUsed)).toEqual([
      0n,
      3021n,
      121n,
    ]);
  });
});
