import "../setup";
import { describe, expect, test } from "bun:test";
import type {
  ModuleActionSimCtx,
  SimCallResult,
  SimOpcode,
} from "@evmcrispr/sdk";
import { frameAction } from "../../src/actions";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";

/** A host whose body calls throw on the `failAt`-th call (a lost RPC). */
type CallArgs = Parameters<ModuleActionSimCtx["call"]>[0];

function fakeHost(
  failAt?: number,
  baseFee = 0n,
  {
    chainId = 81412,
    code = {} as Record<string, `0x${string}`>,
    /** A target's own answer, given the opcodes the frame runs with. */
    behave,
  }: {
    chainId?: number;
    code?: Record<string, `0x${string}`>;
    behave?: (
      args: CallArgs,
      opcodes: readonly SimOpcode[],
    ) => Partial<SimCallResult> | undefined;
  } = {},
) {
  const seen: CallArgs[] = [];
  let opcodes: readonly SimOpcode[] = [];
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
    async call(args) {
      const { to } = args;
      calls++;
      seen.push(args);
      if (calls === failAt) throw new Error("upstream RPC timed out");
      warm.add(to.toLowerCase());
      // The body creates a contract: the sender's nonce moves.
      nonces.set(SENDER, (nonces.get(SENDER) ?? 0n) + 1n);
      return {
        success: true,
        returnData: "0x",
        gasUsed: 21n,
        logs: [],
        ...behave?.(args, opcodes),
      };
    },
    stateChanges: async () => ({ balances: [], slots: [], codes: [] }),
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
    async withOpcodes(added, run) {
      const previous = opcodes;
      opcodes = added;
      try {
        return await run();
      } finally {
        opcodes = previous;
      }
    },
  };
  return { sim, depth: () => depth, log, nonces, balances, seen };
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

    // Measured on the chain (hegota-post-tx-probe (e), (f)): the payer is
    // charged max fee × (intrinsic gas + every frame's limits) when it
    // approves, and refunded the unused part after the POST_TX frames.
    // Intrinsic: EIP-8141's 12000 + 475 a frame + the frames' data + 2800
    // and the signature's 65 bytes + 6000 a frame with value, and 48 more.
    const FEES = { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n };
    const MAX_COST =
      1_000n *
      (12_000n +
        3n * 475n +
        2_800n +
        65n * 16n +
        48n +
        30_000n +
        2n * (50_000n + 200_000n));
    const ONE = 10n ** 18n;

    test("the payer is charged its maximum cost when it approves, and refunded what it did not use", async () => {
      const during: (bigint | undefined)[] = [];
      let balances: Map<string, bigint> | undefined;
      const host = fakeHost(undefined, 7n, {
        chainId: HEGOTA,
        // A target with code: its frames use the fake's 21 gas each.
        code: { [DEAD.toLowerCase()]: "0x00" },
        behave: () => {
          during.push(balances?.get(SENDER));
          return undefined;
        },
      });
      balances = host.balances;
      host.balances.set(SENDER, ONE);
      await frameAction.simulate!(
        action(2, FEES, { chainId: HEGOTA }),
        host.sim,
      );
      expect(during).toEqual([ONE - MAX_COST, ONE - MAX_COST]);
      // The fee: two frames of 21 gas at the base fee 7 plus the tip 1.
      expect(host.balances.get(SENDER)).toBe(ONE - 42n * 8n);
    });

    test("a payer that can pay the gas used but not the maximum cost makes the transaction invalid", async () => {
      const host = fakeHost(undefined, 7n, { chainId: HEGOTA });
      host.balances.set(SENDER, MAX_COST - 1n);
      await expect(
        frameAction.simulate!(action(2, FEES, { chainId: HEGOTA }), host.sim),
      ).rejects.toThrow(
        `The frame transaction is invalid: ${SENDER} cannot pay the fee: its gas limits cost up to`,
      );
      expect(host.depth()).toBe(0);
    });

    test("without fees, or on the tracer devnets, nothing is charged before the body", async () => {
      for (const [chainId, fees] of [
        [HEGOTA, undefined],
        [81412, FEES],
      ] as const) {
        const during: (bigint | undefined)[] = [];
        let balances: Map<string, bigint> | undefined;
        const host = fakeHost(undefined, 7n, {
          chainId,
          behave: () => {
            during.push(balances?.get(SENDER));
            return undefined;
          },
        });
        balances = host.balances;
        host.balances.set(SENDER, ONE);
        await frameAction.simulate!(action(2, fees, { chainId }), host.sim);
        expect(during).toEqual([ONE, ONE]);
      }
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

  describe("POST_TX frames (post-verify)", () => {
    const HEGOTA = 3151908;
    const A = "0x000000000000000000000000000000000000000A";
    const FAILS = "0x00000000000000000000000000000000000000FF";
    const CHECK = "0x000000000000000000000000000000000000c4ec";
    const ENTRY_POINT = "0x00000000000000000000000000000000000000aa";
    const LOG = {
      address: DEAD as `0x${string}`,
      topics: [] as `0x${string}`[],
      data: "0x" as const,
    };
    const frame = (target: string, more: object = {}) => ({
      mode: "sender" as const,
      target: target as `0x${string}`,
      data: "0x" as const,
      value: 0n,
      gas: 50_000n,
      stateGas: 200_000n,
      ...more,
    });
    const post = (target: string) => ({
      ...frame(target),
      mode: "postTx" as const,
      stateGas: 0n,
    });
    const tx = () =>
      frameAction.create({
        chainId: HEGOTA,
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
            frame(DEAD),
            // An atomic group that rolls back: its log is not the trace's.
            frame(A, { atomic: true }),
            frame(FAILS),
            post(CHECK),
            post(CHECK),
          ],
        },
      });
    /** The checks read EVENT_COUNT through TXTRACE (index on top). */
    const eventCount = (opcodes: readonly SimOpcode[]) =>
      opcodes
        .find((o) => o.opcode === 0xb6)!
        .run({ address: CHECK, operands: [0n, 0x0cn], isStatic: true });

    test("run after the body, from the entry point, static, reading what took effect", async () => {
      const counts: unknown[] = [];
      const host = fakeHost(undefined, 0n, {
        chainId: HEGOTA,
        code: { [CHECK.toLowerCase()]: "0x00", [A.toLowerCase()]: "0x00" },
        behave: (args, opcodes) => {
          const to = args.to.toLowerCase();
          if (to === DEAD.toLowerCase() || to === A.toLowerCase())
            return { logs: [LOG] };
          if (to === FAILS.toLowerCase()) return { success: false };
          if (to === CHECK.toLowerCase()) counts.push(eventCount(opcodes));
          return undefined;
        },
      });
      const receipt = (await frameAction.simulate!(
        tx(),
        host.sim,
      )) as unknown as {
        frameReceipts: { status: string }[];
      };
      const checks = host.seen.filter(
        (c) => c.to.toLowerCase() === CHECK.toLowerCase(),
      );
      expect(checks).toHaveLength(2);
      for (const c of checks) {
        expect(c.caller.toLowerCase()).toBe(ENTRY_POINT);
        expect(c.isStatic).toBe(true);
      }
      // DEAD's log only: the rolled-back group's is gone.
      expect(counts).toEqual([{ push: 1n }, { push: 1n }]);
      expect(receipt.frameReceipts.map((f) => f.status)).toEqual([
        "impersonated",
        "success",
        "reverted",
        "reverted",
        "success",
        "success",
      ]);
    });

    test("a failing check reverts the body, skips the checks after it, and keeps the transaction", async () => {
      let checked = 0;
      const host = fakeHost(undefined, 0n, {
        chainId: HEGOTA,
        code: { [CHECK.toLowerCase()]: "0x00" },
        behave: (args) =>
          args.to.toLowerCase() === CHECK.toLowerCase() && ++checked === 1
            ? { success: false }
            : undefined,
      });
      // The run stops as a send would: the transaction is mined, its
      // body reverted, and the failed check named.
      const error = await frameAction.simulate!(tx(), host.sim).catch(
        (e: Error) => e,
      );
      expect((error as Error).message).toBe(
        `A post-verify check failed: post-verify frame 5 reverted, so the transaction's body was reverted (0x${"00".repeat(32)})`,
      );
      expect(checked).toBe(1);
      // The body's checkpoint is reverted; the transaction's is committed.
      expect(host.log.indexOf("revert 2")).toBeGreaterThan(-1);
      expect(host.log.indexOf("revert 2")).toBeLessThan(
        host.log.indexOf("commit 1"),
      );
      expect(host.depth()).toBe(0);
    });
  });
});
