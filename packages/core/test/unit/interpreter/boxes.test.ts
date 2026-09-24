import { describe, expect, it } from "bun:test";
import { getEventListeners } from "node:events";
import type { Action, BoxSnapshot } from "@evmcrispr/sdk";
import { BoxRegistry } from "../../../src/interpreter/boxes";
import { OutcomeRegistry } from "../../../src/interpreter/outcomes";

function setup(realRun = true, { realSleep = false } = {}) {
  const outcomes = new OutcomeRegistry();
  const snapshots: BoxSnapshot[] = [];
  const lines: string[] = [];
  const boxes = new BoxRegistry({
    outcomes,
    emit: (s) => snapshots.push(s),
    log: (m, box) => lines.push(`${box}|${m}`),
    sleep: realSleep
      ? undefined
      : (ms, signal) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(resolve, Math.min(ms, 5));
            signal.addEventListener("abort", () => {
              clearTimeout(t);
              reject(new Error("aborted"));
            });
          }),
  });
  const open = (
    o: Parameters<BoxRegistry["open"]>[0] extends infer T
      ? Omit<T & object, "simulated" | "realRun">
      : never,
    simulated = false,
  ) => boxes.open({ ...(o as any), simulated, realRun: () => realRun });
  return { outcomes, boxes, snapshots, lines, open };
}

const tx = (): Action => ({ to: "0x01", data: "0x" });

describe("BoxRegistry", () => {
  it("emits a snapshot and a tagged log line per change", () => {
    const { open, snapshots, lines } = setup();
    const box = open({ title: "CoW TWAP 0x45", detail: "Waiting" });
    box.update({ detail: "1/4 executed", progress: [1, 4] });
    box.done("Finished");
    expect(snapshots.map((s) => [s.state, s.detail])).toEqual([
      ["live", "Waiting"],
      ["live", "1/4 executed"],
      ["done", "Finished"],
    ]);
    expect(snapshots.at(-1)!.history).toEqual(["Waiting", "1/4 executed"]);
    expect(lines).toEqual([
      `${box.id}|CoW TWAP 0x45: Waiting`,
      `${box.id}|CoW TWAP 0x45: 1/4 executed`,
      `${box.id}|CoW TWAP 0x45: Finished`,
    ]);
  });

  it("ignores changes after a box ended", () => {
    const { open, snapshots } = setup();
    const box = open({ title: "T" });
    box.fail("boom");
    box.update({ detail: "late" });
    box.done("late");
    expect(snapshots.at(-1)!.state).toBe("failed");
    expect(snapshots).toHaveLength(2);
  });

  it("runs watch once the followed actions settle, then holds until it returns", async () => {
    const { open, outcomes, boxes } = setup();
    const action = tx();
    const box = open({ title: "T", follows: [action] });
    let seen = "";
    let release!: () => void;
    box.watch(async ({ outcome }) => {
      seen = outcome.kind;
      await new Promise<void>((r) => {
        release = r;
      });
      box.done("ok");
    });
    const waiting = boxes.waitForHolding();
    outcomes.settle(action, { kind: "confirmed" });
    await Bun.sleep(1);
    expect(seen).toBe("confirmed");
    expect(boxes.liveCount()).toBe(1);
    release();
    await waiting;
    expect(boxes.liveCount()).toBe(0);
  });

  it("ends a box failed when its watch throws", async () => {
    const { open, boxes, snapshots } = setup();
    const box = open({ title: "T" });
    box.watch(async () => {
      throw new Error("status API broke");
    });
    await boxes.waitForHolding();
    expect(snapshots.at(-1)).toMatchObject({
      state: "failed",
      detail: "status API broke",
    });
  });

  it("does not hold for simulated boxes or dry runs", async () => {
    const sim = setup();
    sim
      .open({ title: "T", holds: true }, true)
      .watch(() => new Promise(() => {}));
    await sim.boxes.waitForHolding();
    const dry = setup(false);
    dry.open({ title: "T", holds: true });
    await dry.boxes.waitForHolding();
  });

  it("poll retries failing steps with a Reconnecting… detail", async () => {
    const { open, snapshots } = setup();
    const box = open({ title: "T" });
    let calls = 0;
    await box.poll(
      async () => {
        calls++;
        if (calls === 1) throw new Error("RPC down");
        return calls < 3 ? "continue" : "stop";
      },
      { every: 1 },
    );
    expect(calls).toBe(3);
    expect(snapshots.some((s) => s.detail === "Reconnecting…")).toBe(true);
  });

  for (const realSleep of [false, true])
    it(`poll stops promptly on abort (${realSleep ? "default" : "injected"} sleep)`, async () => {
      const { open, boxes, snapshots } = setup(true, { realSleep });
      const box = open({ title: "T", holds: true });
      let polled!: Promise<void>;
      box.watch(() => {
        polled = box.poll(async () => "continue", { every: 60_000 });
        return polled;
      });
      const controller = new AbortController();
      const waiting = boxes.waitForHolding(controller.signal);
      await Bun.sleep(1);
      controller.abort();
      await expect(waiting).rejects.toThrow("Execution cancelled");
      await Promise.race([
        polled,
        Bun.sleep(50).then(() => {
          throw new Error("poll still sleeping");
        }),
      ]);
      expect(snapshots.at(-1)).toMatchObject({
        state: "cancelled",
        detail: "Stopped following",
      });
      expect(box.signal.aborted).toBe(true);
    });

  it("default poll sleep does not pile up abort listeners", async () => {
    const { open } = setup(true, { realSleep: true });
    const box = open({ title: "T" });
    let calls = 0;
    await box.poll(async () => (++calls < 50 ? "continue" : "stop"), {
      every: 0,
    });
    expect(calls).toBe(50);
    expect(getEventListeners(box.signal, "abort")).toHaveLength(0);
  });

  it("does not publish or log no-op updates", () => {
    const { open, snapshots, lines } = setup();
    const box = open({ title: "Safe tx", detail: "1/2 confirmations" });
    box.update({ detail: "1/2 confirmations", progress: [1, 2] });
    box.update({ detail: "1/2 confirmations", progress: [1, 2] });
    box.update({});
    expect(snapshots).toHaveLength(2);
    expect(lines).toEqual([`${box.id}|Safe tx: 1/2 confirmations`]);
    box.update({ progress: [1, 2], links: { safe: "https://x" } });
    box.update({ links: { safe: "https://x" } });
    expect(snapshots).toHaveLength(3);
    expect(lines).toHaveLength(1);
  });

  it("logs a repeated Reconnecting… only once", async () => {
    const { open, lines } = setup();
    const box = open({ title: "T", detail: "Waiting" });
    let calls = 0;
    await box.poll(
      async () => {
        if (++calls < 4) throw new Error("RPC down");
        return "stop";
      },
      { every: 1 },
    );
    expect(lines.filter((l) => l.endsWith("Reconnecting…"))).toHaveLength(1);
  });

  it("does not log the unchanged detail again when a watch ends a live box", async () => {
    const { open, boxes, snapshots, lines } = setup();
    const box = open({ title: "T", detail: "4/4 executed" });
    box.watch(async () => {});
    await boxes.waitForHolding();
    expect(snapshots.at(-1)).toMatchObject({
      state: "done",
      detail: "4/4 executed",
    });
    expect(lines).toEqual([`${box.id}|T: 4/4 executed`]);
  });

  it("parents a following box under its carrier box, even when the carrier appears later", () => {
    const { open, outcomes, snapshots } = setup();
    const inner = tx();
    const outer = tx();
    const child = open({ title: "TWAP", follows: [inner] });
    expect(snapshots.at(-1)!.parent).toBeUndefined();
    const parent = open({ title: "Safe tx" });
    outcomes.carry([inner], new Promise(() => {}), parent.id);
    expect(snapshots.filter((s) => s.id === child.id).at(-1)!.parent).toBe(
      parent.id,
    );
    void outer;
  });

  it("endLive closes every live box with the given state", () => {
    const { open, boxes, snapshots } = setup();
    open({ title: "A" });
    open({ title: "B" }, true);
    boxes.endLive("done", (s) =>
      s.simulated ? "Simulation ended" : "Stopped following",
    );
    expect(
      snapshots.slice(-2).map((s) => [s.title, s.state, s.detail]),
    ).toEqual([
      ["A", "done", "Stopped following"],
      ["B", "done", "Simulation ended"],
    ]);
  });
  it("cancel ends a box cancelled with its detail", () => {
    const { open, snapshots } = setup();
    const box = open({ title: "CoW TWAP", detail: "1/4 executed" });
    box.cancel("Cancelled on-chain");
    expect(snapshots.at(-1)).toMatchObject({
      state: "cancelled",
      detail: "Cancelled on-chain",
      history: ["1/4 executed"],
    });
    expect(box.signal.aborted).toBe(true);
  });

  it("box ids are unique across registries (runs)", () => {
    const a = setup().open({ title: "A" });
    const b = setup().open({ title: "B" });
    expect(a.id).not.toBe(b.id);
  });

  it("cancel while holding stops following, not a bare Cancelled", async () => {
    const { open, boxes, snapshots } = setup();
    open({ title: "Safe tx", holds: true });
    const controller = new AbortController();
    const waiting = boxes.waitForHolding(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow("Execution cancelled");
    expect(snapshots.at(-1)).toMatchObject({
      state: "cancelled",
      detail: "Stopped following",
    });
  });

  it("a failed script cancels boxes whose own work already succeeded", async () => {
    const { open, outcomes, boxes, snapshots } = setup();
    const confirmed = tx();
    const pending = tx();
    // Posted and holding without follows (a Safe proposal).
    open({ title: "Proposal", holds: true });
    // Following a confirmed registration, watch running (a TWAP).
    const twap = open({ title: "TWAP", follows: [confirmed] });
    twap.watch(() => new Promise(() => {}));
    // Still waiting for an outcome that never settled.
    const waiting = open({ title: "Waiting", follows: [pending] });
    waiting.watch(async () => {});
    outcomes.settle(confirmed, { kind: "confirmed" });
    await Bun.sleep(1);
    boxes.stopOnFailure("boom");
    const last = (title: string) =>
      snapshots.filter((s) => s.title === title).at(-1);
    expect(last("Proposal")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following: the script failed",
    });
    expect(last("TWAP")).toMatchObject({
      state: "cancelled",
      detail: "Stopped following: the script failed",
    });
    expect(last("Waiting")).toMatchObject({
      state: "failed",
      detail: "Script stopped: boom",
    });
  });

  it("endSimulated ends only live simulated boxes", async () => {
    const { open, boxes, snapshots } = setup();
    open({ title: "Real" });
    open({ title: "Sim" }, true);
    await boxes.endSimulated("Simulation ended");
    const last = (title: string) =>
      snapshots.filter((s) => s.title === title).at(-1);
    expect(last("Sim")).toMatchObject({
      state: "done",
      detail: "Simulation ended",
    });
    expect(last("Real")!.state).toBe("live");
  });
});

describe("BoxRegistry countdown", () => {
  it("publishes countdown changes without a log line, and clears it when the box ends", () => {
    const outcomes = new OutcomeRegistry();
    const snapshots: BoxSnapshot[] = [];
    const lines: string[] = [];
    const boxes = new BoxRegistry({
      outcomes,
      emit: (s) => snapshots.push(s),
      log: (m) => lines.push(m),
    });
    const box = boxes.open({
      title: "T",
      detail: "d",
      simulated: false,
      realRun: () => true,
    });
    const countdown = {
      label: "Next part in",
      from: 100,
      until: 160,
      segment: 1,
    };
    box.update({ countdown });
    box.update({ countdown }); // unchanged: not republished
    expect(snapshots.at(-1)!.countdown).toEqual(countdown);
    expect(snapshots).toHaveLength(2);
    expect(lines).toEqual(["T: d"]);
    box.update({ countdown: null });
    expect(snapshots.at(-1)!.countdown).toBeUndefined();
    box.update({ countdown });
    box.done("Finished");
    expect(snapshots.at(-1)).toMatchObject({
      state: "done",
      countdown: undefined,
    });
  });
});
