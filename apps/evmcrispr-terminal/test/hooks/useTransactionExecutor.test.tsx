import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BoxSnapshot } from "@evmcrispr/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";

// mock.module is process-global in bun, and other suites reach wagmi
// transitively — keep every real export in place and swap only what the
// executor reads.
const actualWagmi = await import("wagmi");
mock.module("wagmi", () => ({
  ...actualWagmi,
  useWalletClient: () => ({ data: undefined }),
}));

type Config = {
  onLog?: (message: string, prev?: string[], meta?: { box?: string }) => void;
  onBox?: (snapshot: BoxSnapshot) => void;
  onLine?: (line: number | null) => void;
};
let config: Config = {};
let finish: () => void = () => {};
let fail: (error: Error) => void = () => {};
let signal: AbortSignal | undefined;
let runs = 0;

mock.module("../../src/evml/workerEvml", () => ({
  workerEvml: {
    with(overrides: Config) {
      config = overrides;
      return this;
    },
    script: () => ({
      simulate: async () => ({ success: true, actions: [], logs: [] }),
      execute: (_wallet: unknown, options: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          runs++;
          fail = reject;
          signal = options.signal;
          finish = () =>
            resolve({ executed: [{ action: {} }], exited: false, logs: [] });
        }),
    }),
  },
}));

const { makeSafeBatchedHandler, trackFollowedBoxes, useTransactionExecutor } =
  await import("../../src/hooks/useTransactionExecutor");
const { terminalStoreGet, terminalStoreActions } = await import(
  "../../src/stores/terminal-store"
);

const snap = (over: Partial<BoxSnapshot> = {}): BoxSnapshot => ({
  id: "b1",
  state: "live",
  title: "Safe tx",
  detail: "Proposed",
  history: [],
  simulated: false,
  ...over,
});

beforeEach(() => {
  config = {};
  finish = () => {};
  fail = () => {};
  signal = undefined;
  runs = 0;
  terminalStoreActions("currentScriptId", "script-a");
  terminalStoreActions("isLoading", false);
});

describe("trackFollowedBoxes", () => {
  test("counts live boxes the run follows, never simulated ones", () => {
    const boxes = trackFollowedBoxes();
    expect(boxes.update(snap())).toBe(1);
    expect(boxes.update(snap({ id: "sim", simulated: true }))).toBe(1);
    expect(boxes.update(snap({ id: "b2" }))).toBe(2);
    expect(boxes.update(snap({ state: "done" }))).toBe(1);
    expect(boxes.update(snap({ id: "b2", state: "failed" }))).toBe(0);
  });
});

describe("useTransactionExecutor watching phase", () => {
  test("enters watching when the script ends with a live box", async () => {
    const { result } = renderHook(() =>
      useTransactionExecutor(undefined, "safe:propose ..."),
    );
    let run: Promise<boolean> | undefined;
    act(() => {
      run = result.current.executeScript();
    });
    await waitFor(() => expect(config.onBox).toBeDefined());

    act(() => {
      config.onLine?.(1);
      config.onBox?.(snap());
      config.onLog?.("Safe tx: Proposed", [], { box: "b1" });
      config.onLine?.(null);
    });
    expect(result.current.phase).toBe("watching");
    expect(result.current.followingBoxes).toBe(1);
    // The box renders as one entry; its tagged line does not repeat it.
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].kind).toBe("box");

    await act(async () => {
      config.onBox?.(snap({ state: "done", detail: "Executed" }));
      finish();
      await run;
    });
    expect(result.current.phase).toBe("success");
    expect(result.current.followingBoxes).toBe(0);
  });

  test("stays running when only simulated boxes are live", async () => {
    const { result } = renderHook(() =>
      useTransactionExecutor(undefined, "sim:fork ..."),
    );
    let run: Promise<boolean> | undefined;
    act(() => {
      run = result.current.executeScript();
    });
    await waitFor(() => expect(config.onBox).toBeDefined());

    act(() => {
      config.onLine?.(1);
      config.onBox?.(snap({ simulated: true }));
      config.onLine?.(null);
    });
    expect(result.current.phase).toBe("running");

    await act(async () => {
      finish();
      await run;
    });
    expect(result.current.phase).toBe("success");
  });
});

describe("makeSafeBatchedHandler", () => {
  test("reports the batch as queued in the Safe, not confirmed", async () => {
    const safeTxHash = `0x${"5a".repeat(32)}`;
    const connector = {
      getProvider: async () => ({
        sdk: { txs: { send: async () => ({ safeTxHash }) } },
      }),
      getChainId: async () => 100,
    };
    const result = await makeSafeBatchedHandler(connector)(
      {
        type: "batched",
        chainId: 100,
        from: "0x000000000000000000000000000000000000dEaD",
        actions: [
          { to: "0x1111111111111111111111111111111111111111", data: "0x" },
        ],
      },
      {} as any,
    );
    expect(result).toEqual({
      status: "queued",
      reason: `Queued in the Safe as ${safeTxHash}`,
    });
  });
});

describe("useTransactionExecutor stopped following", () => {
  test("cancel while watching keeps the run a success", async () => {
    const { result } = renderHook(() =>
      useTransactionExecutor(undefined, "swaps:twap ..."),
    );
    let run: Promise<boolean> | undefined;
    act(() => {
      run = result.current.executeScript();
    });
    await waitFor(() => expect(config.onBox).toBeDefined());
    act(() => {
      config.onLine?.(1);
      config.onBox?.(snap());
      config.onLine?.(null);
    });
    expect(result.current.phase).toBe("watching");
    // The core resolves a run cancelled after the script ended.
    await act(async () => {
      result.current.cancelExecution();
      config.onBox?.(snap({ state: "cancelled", detail: "Cancelled" }));
      finish();
      expect(await run).toBe(true);
    });
    expect(result.current.phase).toBe("success");
    expect(result.current.executed).toHaveLength(1);
    expect(result.current.errors).toEqual([]);
  });
});

describe("useTransactionExecutor worker killed or crashed", () => {
  const startWatching = async () => {
    const hook = renderHook(() =>
      useTransactionExecutor(undefined, "safe:propose ..."),
    );
    let run: Promise<boolean> | undefined;
    act(() => {
      run = hook.result.current.executeScript();
    });
    await waitFor(() => expect(config.onBox).toBeDefined());
    act(() => {
      config.onLine?.(1);
      config.onBox?.(snap());
      config.onLine?.(null);
    });
    expect(hook.result.current.phase).toBe("watching");
    return { ...hook, run: run! };
  };
  const onlyBox = (entries: { kind: string; box?: BoxSnapshot }[]) => {
    expect(entries).toHaveLength(1);
    return entries[0].box as BoxSnapshot;
  };

  test("a kill after cancel ends the run cancelled and its boxes", async () => {
    const { result, run } = await startWatching();
    // The kill grace ran out: the worker client rejects the run and no
    // cancelled snapshot ever arrives.
    await act(async () => {
      result.current.cancelExecution();
      fail(new Error("Execution cancelled"));
      expect(await run).toBe(false);
    });
    expect(result.current.phase).toBe("cancelled");
    expect(result.current.followingBoxes).toBe(0);
    expect(terminalStoreGet("isLoading")).toBe(false);
    expect(onlyBox(result.current.entries)).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
    });
  });

  test("a worker crash ends the run in error and its boxes", async () => {
    const { result, run } = await startWatching();
    await act(async () => {
      fail(new Error("EVML worker crashed: out of memory"));
      expect(await run).toBe(false);
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.errors).toEqual([
      "EVML worker crashed: out of memory",
    ]);
    expect(result.current.followingBoxes).toBe(0);
    expect(terminalStoreGet("isLoading")).toBe(false);
    const box = onlyBox(result.current.entries);
    expect(box.state).toBe("cancelled");
    expect(box.detail).toStartWith("Stopped following");
  });
});

describe("useTransactionExecutor script switch", () => {
  const startWatching = async () => {
    const hook = renderHook(() =>
      useTransactionExecutor(undefined, "safe:propose ..."),
    );
    let run: Promise<boolean> | undefined;
    act(() => {
      run = hook.result.current.executeScript();
    });
    await waitFor(() => expect(config.onBox).toBeDefined());
    act(() => {
      config.onLine?.(1);
      config.onBox?.(snap());
      config.onLine?.(null);
    });
    expect(hook.result.current.phase).toBe("watching");
    return { ...hook, run: run! };
  };

  test("switching scripts cancels the run and ignores its late callbacks", async () => {
    const { result, run } = await startWatching();
    const old = config;
    act(() => {
      terminalStoreActions("currentScriptId", "script-b");
    });
    expect(signal?.aborted).toBe(true);
    expect(terminalStoreGet("isLoading")).toBe(false);
    expect(result.current.phase).toBe("idle");

    // The old run keeps reporting while it unwinds: none of it reaches the
    // new script's console, phase or executed list.
    await act(async () => {
      old.onBox?.(snap({ id: "b9", detail: "2/4 executed" }));
      old.onLog?.("stray line");
      old.onLine?.(null);
      finish();
      await run;
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.followingBoxes).toBe(0);
    expect(result.current.phase).toBe("idle");
    expect(result.current.executed).toEqual([]);
    expect(terminalStoreGet("isLoading")).toBe(false);
  });

  test("a second execute while a run is in flight starts nothing", async () => {
    const { result, run } = await startWatching();
    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.executeScript();
    });
    expect(second).toBe(false);
    expect(runs).toBe(1);
    expect(result.current.phase).toBe("watching");
    // The first run is still the one Cancel stops.
    act(() => result.current.cancelExecution());
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish();
      await run;
    });
  });
});
