import { describe, expect, it } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import type { WalletClient } from "viem";

import { createWorkerEvml } from "../../../src/worker/client";
import type { WorkerLike } from "../../../src/worker/protocol";

const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
const wallet = { account: { address: ACCOUNT } } as unknown as WalletClient;

const liveBox: BoxSnapshot = {
  id: "box-run-1",
  state: "live",
  title: "Transaction to 0x1111...1111",
  detail: "Waiting for wallet…",
  history: [],
  simulated: false,
};

/** An in-process worker that opens one live box and proxies one action,
 *  then never answers: the test crashes it or lets the kill grace run. */
function fakeWorker() {
  const listeners: Record<string, ((event: any) => void)[]> = {};
  const emit = (type: string, event: unknown) => {
    for (const l of listeners[type] ?? []) l(event);
  };
  const posted: { kind: string }[] = [];
  let spawned = 0;
  const factory = (): WorkerLike => {
    spawned++;
    setTimeout(() => emit("message", { data: { kind: "ready" } }), 0);
    return {
      postMessage(message: any) {
        posted.push(message);
        if (message.kind !== "interpret") return;
        const id = message.id;
        emit("message", { data: { kind: "box", id, snapshot: liveBox } });
        emit("message", {
          data: {
            kind: "action",
            id,
            actionId: 0,
            action: {
              to: "0x1111111111111111111111111111111111111111",
              data: "0x",
            },
          },
        });
      },
      terminate() {},
      addEventListener(type, listener) {
        (listeners[type] ??= []).push(listener);
      },
    };
  };
  return { factory, emit, posted, spawned: () => spawned };
}

async function start(signal?: AbortSignal) {
  const worker = fakeWorker();
  const snapshots: BoxSnapshot[] = [];
  let handlerSignal: AbortSignal | undefined;
  let finishHandler!: () => void;
  let handling!: () => void;
  const reached = new Promise<void>((r) => {
    handling = r;
  });
  const evml = createWorkerEvml(
    worker.factory,
    { onBox: (s) => snapshots.push(s) },
    { killGraceMs: 20 },
  );
  const run = evml.script("exec").execute(wallet, {
    prepareChains: false,
    signal,
    handlers: {
      // A wallet prompt nobody answers until the test says so.
      transaction: (_action, ctx) => {
        handlerSignal = ctx.signal;
        handling();
        return new Promise((resolve) => {
          finishHandler = () => resolve({ status: "success" });
        });
      },
    },
  });
  await reached;
  return {
    worker,
    run,
    snapshots,
    handlerSignal: () => handlerSignal,
    finishHandler: () => finishHandler(),
  };
}

describe("worker kill and crash", () => {
  it("a crash ends the boxes the worker left live and stops pending actions", async () => {
    const { worker, run, snapshots, handlerSignal, finishHandler } =
      await start();
    worker.emit("error", { message: "out of memory" });
    await expect(run).rejects.toThrow("EVML worker crashed: out of memory");
    expect(snapshots.at(-1)).toMatchObject({
      id: liveBox.id,
      state: "cancelled",
      detail: "Stopped following: the EVML worker crashed",
    });
    // The proxied wallet prompt is told to stop.
    expect(handlerSignal()?.aborted).toBe(true);
    // Answering it later does not respawn a worker for a dead run.
    finishHandler();
    await Bun.sleep(5);
    expect(worker.spawned()).toBe(1);
  });

  it("a kill after the cancel grace ends the live boxes cancelled", async () => {
    const controller = new AbortController();
    const { run, snapshots } = await start(controller.signal);
    controller.abort();
    await expect(run).rejects.toThrow("Execution cancelled");
    expect(snapshots.at(-1)).toMatchObject({
      id: liveBox.id,
      state: "cancelled",
      detail: "Stopped following",
    });
  });
});
