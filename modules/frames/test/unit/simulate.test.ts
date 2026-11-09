import "../setup";
import { describe, expect, test } from "bun:test";
import type { ModuleActionSimCtx } from "@evmcrispr/sdk";
import { frameAction } from "../../src/actions";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";

/** A host whose body calls throw on the `failAt`-th call (a lost RPC). */
function fakeHost(
  failAt?: number,
  baseFee = 0n,
  { chainId = 81412, code = {} as Record<string, `0x${string}`> } = {},
) {
  let depth = 0;
  const balances = new Map<string, bigint>();
  let calls = 0;
  const warm = new Set<string>();
  const nonces = new Map<string, bigint>();
  const log: string[] = [];
  const sim: ModuleActionSimCtx = {
    chainId,
    blockNumber: 1n,
    timestamp: 1n,
    baseFee,
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
    getBalance: async (a) => balances.get(a) ?? 0n,
    async setBalance(a, b) {
      balances.set(a, b);
    },
    getCode: async (a) => code[a.toLowerCase()] ?? "0x",
    isWarm: (a) => warm.has(a.toLowerCase()),
    warm: (a) => warm.add(a.toLowerCase()),
    withOpcodes: (_, run) => run(),
  };
  return { sim, depth: () => depth, log, nonces, balances };
}

const action = (
  n = 2,
  fees?: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint },
  { chainId = 81412, gas = 50_000n } = {},
) =>
  frameAction.create({
    chainId,
    from: SENDER,
    data: {
      mempool: "canonical",
      ...(fees && { fees }),
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
          gas,
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

  test("without fees nothing is charged; with them the payer pays the frames' gas used at the base fee plus the tip", async () => {
    const free = fakeHost(undefined, 7n);
    free.balances.set(SENDER, 1_000_000n);
    await frameAction.simulate!(action(2), free.sim);
    expect(free.balances.get(SENDER)).toBe(1_000_000n);

    const paying = fakeHost(undefined, 7n);
    paying.balances.set(SENDER, 1_000_000n);
    const receipt = await frameAction.simulate!(
      action(2, { maxFeePerGas: 100n, maxPriorityFeePerGas: 3n }),
      paying.sim,
    );
    // 0 + 3021 + 121 gas, at 7 + 3 wei.
    expect(receipt.gasUsed).toBe(3142n);
    expect(paying.balances.get(SENDER)).toBe(1_000_000n - 3142n * 10n);
  });

  test("a payer that cannot pay makes the transaction invalid, and every checkpoint is unwound", async () => {
    const host = fakeHost(undefined, 7n);
    host.balances.set(SENDER, 100n);
    await expect(
      frameAction.simulate!(action(2, { maxFeePerGas: 7n }), host.sim),
    ).rejects.toThrow(
      `The frame transaction is invalid: ${SENDER} cannot pay the fee: the gas used costs`,
    );
    expect(host.depth()).toBe(0);
    expect(host.balances.get(SENDER)).toBe(100n);
  });

  test("a max fee below the fork's base fee is refused before anything runs", async () => {
    const host = fakeHost(undefined, 7n);
    await expect(
      frameAction.simulate!(action(2, { maxFeePerGas: 6n }), host.sim),
    ).rejects.toThrow("is below the base fee");
    expect(host.log).not.toContain("checkpoint 1");
  });

  describe("on the Hegota devnet", () => {
    const HEGOTA = 3151908;
    test("a frame to a codeless target uses none of its gas, and runs with 1", async () => {
      const host = fakeHost(undefined, 0n, { chainId: HEGOTA });
      const receipt = (await frameAction.simulate!(
        action(2, undefined, { chainId: HEGOTA, gas: 1n }),
        host.sim,
      )) as unknown as { frameReceipts: { status: string; gasUsed: bigint }[] };
      expect(receipt.frameReceipts.map((f) => [f.status, f.gasUsed])).toEqual([
        ["impersonated", 0n],
        ["success", 0n],
        ["success", 0n],
      ]);
    });

    test("a frame to a target with code pays nothing to reach it, cold or warm", async () => {
      const host = fakeHost(undefined, 0n, {
        chainId: HEGOTA,
        code: { [DEAD.toLowerCase()]: "0x00" },
      });
      const receipt = (await frameAction.simulate!(
        action(2, undefined, { chainId: HEGOTA }),
        host.sim,
      )) as unknown as { frameReceipts: { gasUsed: bigint }[] };
      // The fake's every call uses 21: no 3000 cold or 100 warm on top.
      expect(receipt.frameReceipts.map((f) => f.gasUsed)).toEqual([
        0n,
        21n,
        21n,
      ]);
    });

    test("the tracer devnets still charge a codeless frame to reach its target", async () => {
      const host = fakeHost();
      const receipt = (await frameAction.simulate!(
        action(1, undefined, { gas: 1n }),
        host.sim,
      )) as unknown as { frameReceipts: { status: string }[] };
      expect(receipt.frameReceipts[1]!.status).toBe("reverted");
    });
  });
});
