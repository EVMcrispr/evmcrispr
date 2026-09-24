import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type {
  Action,
  ActionOutcome,
  ActionReport,
  BatchedAction,
  BlockExpressionNode,
  BoxSnapshot,
} from "@evmcrispr/sdk";
import {
  defineCommand,
  defineModule,
  ExitSignal,
  RevertError,
} from "@evmcrispr/sdk";
import { custom } from "viem";
import { createEvml } from "../../../src/evml/tag";
import { Interpreter } from "../../../src/interpreter/Interpreter";

const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
const EXEC = `exec 0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75 "transfer(address,uint256)" ${ACCOUNT} 1`;
// The receipt a host-reported hash resolves to (`eth_getTransactionReceipt`).
let minedStatus: "0x1" | "0x0" = "0x1";
const fakeTransport = custom({
  request: async ({ method, params }: { method: string; params?: any }) => {
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_blockNumber") return "0x9";
    if (method === "eth_getTransactionReceipt")
      return {
        transactionHash: params[0],
        blockNumber: "0x9",
        blockHash: `0x${"cd".repeat(32)}`,
        transactionIndex: "0x0",
        from: ACCOUNT,
        to: ACCOUNT,
        cumulativeGasUsed: "0x1",
        gasUsed: "0x1",
        effectiveGasPrice: "0x1",
        contractAddress: null,
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: minedStatus,
        type: "0x2",
      };
    throw new Error(`unexpected RPC call: ${method}`);
  },
});

// `stub:follow` returns one transaction and opens a box following it; the
// watch ends the box with the outcome kind, or waits for `release`.
let release: (() => void) | undefined;
const follow = defineCommand({
  name: "follow",
  description: "opens a box following its own action",
  args: [{ name: "hold", type: "bool", description: "hold until released" }],
  async run(_module, { hold }, { interpreters }) {
    const action: Action = {
      to: "0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75",
      data: "0x",
    };
    const box = interpreters.box!({
      title: "Follow",
      detail: "Waiting",
      follows: [action],
    });
    box.watch(async ({ outcome }) => {
      if (hold)
        await new Promise<void>((r) => {
          release = r;
        });
      box.done(outcome.kind);
    });
    return [action];
  },
});
// `stub:wrap` collects its block and reports the block's outcome itself
// through `carry` (like a Safe proposal): confirmed 30ms later.
const wrap = defineCommand({
  name: "wrap",
  description: "carries its block through a promise",
  args: [{ name: "block", type: "block", description: "block" }],
  async run(_module, { block }, { interpreters }) {
    const inner = (await interpreters.interpretNode(
      block as BlockExpressionNode,
    )) as Action[];
    const box = interpreters.box!({ title: "Wrap", detail: "Carrying" });
    interpreters.carry!(
      inner,
      new Promise<ActionOutcome>((r) =>
        setTimeout(() => {
          box.done("Carried");
          r({ kind: "confirmed" });
        }, 30),
      ),
      box,
    );
    return [];
  },
});
// `stub:fork` interprets its block as a simulation, the way sim:fork does.
const fork = defineCommand({
  name: "fork",
  description: "simulates its block",
  args: [{ name: "block", type: "block", description: "block" }],
  async run(module, { block }, { interpreters }) {
    try {
      await interpreters.interpretNode(block as BlockExpressionNode, {
        actionCallback: async () => ({ status: "success", blockNumber: 1n }),
        simulation: true,
      });
    } finally {
      await module.context.endSimulatedBoxes?.("Simulation ended");
    }
    return [];
  },
});
// `stub:raw` returns `rawAction` as is (its chain and sender kept).
let rawAction: Action = { to: ACCOUNT, data: "0x" };
const raw = defineCommand({
  name: "raw",
  description: "returns a prepared action",
  args: [],
  async run() {
    return [{ ...rawAction }];
  },
});
const Stub = defineModule("stub", {
  raw: { load: async () => ({ default: raw }), description: "raw" },
  follow: { load: async () => ({ default: follow }), description: "follow" },
  wrap: { load: async () => ({ default: wrap }), description: "wrap" },
  fork: { load: async () => ({ default: fork }), description: "fork" },
});
const evml = createEvml({ account: ACCOUNT, transports: { 1: fakeTransport } });
evml.use(Stub);

function run(
  script: string,
  callback?: (a: Action, report?: ActionReport) => Promise<unknown>,
  signal?: AbortSignal,
  follow = true,
) {
  const snapshots: BoxSnapshot[] = [];
  const lines: { message: string; box?: string }[] = [];
  const interpreter = new Interpreter(evml.registry, {
    ...evml.config,
    follow,
    onBox: (s) => snapshots.push(s),
    onLog: (message, _prev, meta) => lines.push({ message, box: meta?.box }),
  });
  const done = interpreter.interpret(script, callback, { signal });
  return { interpreter, done, snapshots, lines };
}

const last = (snapshots: BoxSnapshot[], title: string) =>
  snapshots.filter((s) => s.title === title).at(-1);

describe("Interpreter - status boxes", () => {
  it("follows a sent action and nests it under the transaction box", async () => {
    const { done, snapshots } = run(
      "load stub\nstub:follow false",
      async () => ({ status: "success", blockNumber: 7n }),
    );
    await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "done",
      detail: "Confirmed in block 7",
    });
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "confirmed",
      parent: tx.id,
    });
  });

  it("links actions collected in a block to the block's own action", async () => {
    const { interpreter, done } = run(`batch (\n  ${EXEC}\n)`, async () => ({
      status: "success",
    }));
    const [batched] = (await done) as BatchedAction[];
    expect(await interpreter.outcomeOf([batched.actions[0]])).toMatchObject({
      kind: "confirmed",
    });
  });

  it("block commands that re-return their actions do not self-carry", async () => {
    const { interpreter, done } = run(`if true (\n  ${EXEC}\n)`, async () => ({
      status: "success",
    }));
    const [action] = await done;
    expect(await interpreter.outcomeOf([action])).toMatchObject({
      kind: "confirmed",
    });
  });

  it("marks a wallet rejection on the transaction box and the dependent box", async () => {
    const rejected = Object.assign(new Error("User rejected the request."), {
      name: "UserRejectedRequestError",
    });
    const { done, snapshots } = run(
      "load stub\nstub:follow false",
      async () => {
        throw rejected;
      },
    );
    await expect(done).rejects.toThrow();
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "rejected",
    });
    expect(
      snapshots.find(
        (s) => s.title.startsWith("Transaction to ") && s.state === "failed",
      )!.detail,
    ).toBe("Rejected in wallet");
  });

  it("keeps the run open until a holding box ends", async () => {
    release = undefined;
    const { done, snapshots } = run(
      "load stub\nstub:follow true",
      async () => ({ status: "success" }),
    );
    let finished = false;
    done.then(() => {
      finished = true;
    });
    await Bun.sleep(20);
    expect(finished).toBe(false);
    release!();
    await done;
    expect(last(snapshots, "Follow")!.state).toBe("done");
  });

  it("cancel while the script runs ends live boxes and rejects", async () => {
    const controller = new AbortController();
    const { done, snapshots } = run(
      "load stub\nstub:follow true\nwait 60",
      async (action) => {
        if ("type" in action && action.type === "terminal")
          return new Promise(() => {});
        return { status: "success" };
      },
      controller.signal,
    );
    await Bun.sleep(20);
    controller.abort();
    await expect(done).rejects.toThrow("Execution cancelled");
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
    });
    release?.();
  });

  it("a failing later line ends live boxes", async () => {
    const { done, snapshots } = run(
      `load stub\nstub:follow true\nexec 0xnotanaddress "f()"`,
      async () => ({ status: "success" }),
    );
    await expect(done).rejects.toThrow();
    // Its registration confirmed and its watch runs: the thing it follows
    // still exists, so the box only stops following.
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following: the script failed",
    });
    release?.();
  });

  it("a failing later line fails boxes still waiting for their outcome", async () => {
    const { done, snapshots } = run(
      `load stub\nstub:wrap (\n  stub:follow false\n)\nexec 0xnotanaddress "f()"`,
      async () => ({ status: "success" }),
    );
    await expect(done).rejects.toThrow();
    expect(last(snapshots, "Follow")!.state).toBe("failed");
    expect(last(snapshots, "Follow")!.detail).toStartWith("Script stopped:");
  });

  it("dry run settles not-sent and does not wait", async () => {
    const { done, snapshots } = run("load stub\nstub:follow false");
    await done;
    await Bun.sleep(1);
    expect(snapshots.some((s) => s.title.startsWith("Transaction to "))).toBe(
      false,
    );
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "not-sent",
    });
  });

  it("a box inside batch follows the batch's send", async () => {
    const { done, snapshots } = run(
      "load stub\nbatch (\n  stub:follow false\n)",
      async () => ({ status: "success", blockNumber: 7n }),
    );
    await done;
    const batch = snapshots.find((s) => s.title.startsWith("Batch of "))!;
    expect(last(snapshots, batch.title)).toMatchObject({
      state: "done",
      detail: "Confirmed in block 7",
    });
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "confirmed",
      parent: batch.id,
    });
  });

  it("a box inside a carrying block follows the carried outcome", async () => {
    const { done, snapshots } = run(
      "load stub\nstub:wrap (\n  stub:follow false\n)",
      async () => ({ status: "success" }),
    );
    await done;
    const wrapBox = last(snapshots, "Wrap")!;
    expect(wrapBox).toMatchObject({ state: "done", detail: "Carried" });
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "confirmed",
      parent: wrapBox.id,
    });
  });

  it("exit is a clean stop: the run still waits for holding boxes", async () => {
    release = undefined;
    const { done, snapshots } = run(
      "load stub\nstub:follow true\nexit",
      async () => ({ status: "success" }),
    );
    let settled = false;
    const outcome = done.then(
      () => undefined,
      (err) => err,
    );
    outcome.then(() => {
      settled = true;
    });
    await Bun.sleep(20);
    expect(settled).toBe(false);
    release!();
    expect(await outcome).toBeInstanceOf(ExitSignal);
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "confirmed",
    });
  });

  it("marks an on-chain revert as Reverted", async () => {
    const { done, snapshots } = run(
      "load stub\nstub:follow false",
      async () => {
        throw new RevertError("Transaction reverted on-chain: 0xabc (details)");
      },
    );
    await expect(done).rejects.toThrow();
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "failed",
      detail: "Reverted",
    });
    expect(last(snapshots, "Follow")).toMatchObject({ detail: "reverted" });
  });

  it("simulated boxes never hold and end with the simulation", async () => {
    release = undefined;
    const { done, snapshots, lines } = run(
      "load stub\nstub:fork (\n  stub:follow true\n)",
      async () => ({ status: "success" }),
    );
    await done;
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "Simulation ended",
      simulated: true,
    });
    // Simulated sends open no transaction box and log no lines: simulation
    // output (CLI, MCP) is unchanged.
    expect(snapshots.some((s) => s.title.startsWith("Transaction to "))).toBe(
      false,
    );
    expect(lines.some((l) => l.message.startsWith("Transaction to "))).toBe(
      false,
    );
    release?.();
  });

  it("simulated boxes end when their simulation block ends", async () => {
    release = undefined;
    let atNextLine: BoxSnapshot | undefined;
    const snapshots: BoxSnapshot[] = [];
    const interpreter = new Interpreter(evml.registry, {
      ...evml.config,
      onBox: (s) => snapshots.push(s),
      onLine: (line) => {
        // The `print` line, the last one: the fork has returned.
        if (line !== null) atNextLine = last(snapshots, "Follow");
      },
    });
    await interpreter.interpret(
      'load stub\nstub:fork (\n  stub:follow true\n)\nprint "after"',
      async () => ({ status: "success" }),
    );
    expect(atNextLine).toMatchObject({
      state: "done",
      detail: "Simulation ended",
    });
    release?.();
  });

  it("follow: false does not wait and stops following", async () => {
    release = undefined;
    const { done, snapshots } = run(
      "load stub\nstub:follow true",
      async () => ({ status: "success" }),
      undefined,
      false,
    );
    await done;
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "done",
      detail: "Stopped following",
    });
    release?.();
  });

  it("tags box log lines", async () => {
    const { done, lines } = run("load stub\nstub:follow false", async () => ({
      status: "success",
    }));
    await done;
    expect(lines.filter((l) => l.box).map((l) => l.message)).toContain(
      "Follow: confirmed",
    );
  });

  it("cancel while a send is pending ends its transaction box cancelled", async () => {
    const controller = new AbortController();
    let sending!: () => void;
    const started = new Promise<void>((r) => {
      sending = r;
    });
    const { done, snapshots } = run(
      "load stub\nstub:follow false",
      () => {
        sending();
        return new Promise(() => {});
      },
      controller.signal,
    );
    await started;
    controller.abort();
    await expect(done).rejects.toThrow("Execution cancelled");
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "cancelled",
      detail: "Cancelled",
    });
    // The box following the cancelled send ends cancelled too, not with
    // the watch's reading of a failed outcome.
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
    });
  });

  it("cancel after the send was reported does not claim it was not sent", async () => {
    const controller = new AbortController();
    let sending!: () => void;
    const started = new Promise<void>((r) => {
      sending = r;
    });
    let sentAction!: Action;
    const { interpreter, done, snapshots } = run(
      "load stub\nstub:follow false",
      (action, report) => {
        sentAction = action;
        report?.sent(`0x${"ab".repeat(32)}`);
        sending();
        return new Promise(() => {});
      },
      controller.signal,
    );
    await started;
    controller.abort();
    await expect(done).rejects.toThrow("Execution cancelled");
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    const final = last(snapshots, tx.title)!;
    expect(final).toMatchObject({
      state: "cancelled",
      detail: "Sent; stopped waiting for the receipt",
    });
    expect(final.links?.Transaction).toContain("ab".repeat(32));
    expect(await interpreter.outcomeOf([sentAction])).toEqual({
      kind: "unknown",
      reason: "Sent; outcome unknown",
    });
    expect(last(snapshots, "Follow")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
    });
  });

  it("links the sent hash on the explorer of the action's own chain", async () => {
    rawAction = { to: ACCOUNT, data: "0x", chainId: 10 };
    const hash = `0x${"ab".repeat(32)}` as const;
    const { done, snapshots } = run(
      "load stub\nstub:raw",
      async (_action, report) => {
        report?.sent(hash);
        return { status: "success" };
      },
    );
    await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)!.links?.Transaction).toBe(
      `https://optimistic.etherscan.io/tx/${hash}`,
    );
  });

  it("says whose signature an other-signer send waits for", async () => {
    rawAction = {
      to: ACCOUNT,
      data: "0x",
      from: "0x1111111111111111111111111111111111111111",
    };
    const { done, snapshots } = run("load stub\nstub:raw", async () => ({
      status: "success",
    }));
    await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(tx.detail).toBe("Waiting for 0x1111...1111");
  });
  it("a host send with no receipt is not counted as confirmed", async () => {
    const { done, snapshots } = run(
      "load stub\nstub:follow false",
      async () => undefined,
    );
    // Nothing follows a send whose outcome is unknown: the run ends.
    await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "done",
      detail: "Sent; outcome unknown",
    });
    // Sent, so not `not-sent`: its outcome is unknown.
    expect(last(snapshots, "Follow")).toMatchObject({ detail: "unknown" });
  });

  it("fetches the receipt when the host returns a bare hash", async () => {
    minedStatus = "0x1";
    rawAction = { to: ACCOUNT, data: "0x" };
    const { interpreter, done, snapshots } = run(
      "load stub\nstub:raw",
      async () => `0x${"ab".repeat(32)}`,
    );
    const [action] = await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "done",
      detail: "Confirmed in block 9",
    });
    expect((await interpreter.outcomeOf([action])).kind).toBe("confirmed");
  });

  it("a host that queues the send (a Safe App) ends the box as queued", async () => {
    const { interpreter, done, snapshots } = run(
      "load stub\nstub:follow false",
      async () => ({
        status: "queued",
        reason: "Queued in the Safe as 0xabc",
      }),
    );
    const [action] = await done;
    const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(snapshots, tx.title)).toMatchObject({
      state: "done",
      detail: "Queued in the Safe as 0xabc",
    });
    expect(await interpreter.outcomeOf([action])).toMatchObject({
      kind: "unknown",
      reason: "Queued in the Safe as 0xabc",
    });
  });

  it("fetches the receipt of a reported hash when the host returns none", async () => {
    for (const [status, state, detail, kind] of [
      ["0x1", "done", "Confirmed in block 9", "confirmed"],
      ["0x0", "failed", "Reverted", "reverted"],
    ] as const) {
      minedStatus = status;
      rawAction = { to: ACCOUNT, data: "0x" };
      const { interpreter, done, snapshots } = run(
        "load stub\nstub:raw",
        async (_action, report) => {
          report?.sent(`0x${"ab".repeat(32)}`);
          return `0x${"ab".repeat(32)}`;
        },
      );
      const [action] = await done;
      const tx = snapshots.find((s) => s.title.startsWith("Transaction to "))!;
      expect(last(snapshots, tx.title)).toMatchObject({ state, detail });
      expect((await interpreter.outcomeOf([action])).kind).toBe(kind);
    }
    minedStatus = "0x1";
  });

  it("logs the full hash with its explorer link", async () => {
    rawAction = { to: ACCOUNT, data: "0x" };
    const hash = `0x${"ab".repeat(32)}` as const;
    const { done, lines } = run("load stub\nstub:raw", async (_a, report) => {
      report?.sent(hash);
      return { status: "success" };
    });
    await done;
    expect(lines.map((l) => l.message).join("\n")).toContain(
      `(https://etherscan.io/tx/${hash})`,
    );
  });

  it("a line with a revert capture still gets its transaction box", async () => {
    const ok = run(`${EXEC} -?!> $failed`, async () => ({
      status: "success",
      blockNumber: 5n,
    }));
    await ok.done;
    const tx = ok.snapshots.find((s) => s.title.startsWith("Transaction to "))!;
    expect(last(ok.snapshots, tx.title)).toMatchObject({
      state: "done",
      detail: "Confirmed in block 5",
    });

    const reverted = run(`${EXEC} -?!> $failed`, async () => {
      throw new RevertError("Transaction reverted on-chain: 0xabc");
    });
    await reverted.done;
    const failed = reverted.snapshots.find((s) =>
      s.title.startsWith("Transaction to "),
    )!;
    expect(last(reverted.snapshots, failed.title)).toMatchObject({
      state: "failed",
      detail: "Reverted",
    });
  });

  it("cancel while watching stops following: the run still resolves", async () => {
    release = undefined;
    const controller = new AbortController();
    const { done, snapshots } = run(
      "load stub\nstub:follow true",
      async () => ({ status: "success" }),
      controller.signal,
    );
    await Bun.sleep(20);
    controller.abort();
    expect(await done).toHaveLength(1);
    expect(last(snapshots, "Follow")).toMatchObject({ state: "cancelled" });
    release?.();
  });
});
