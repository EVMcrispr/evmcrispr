import { describe, expect, test } from "bun:test";
import { type ConsoleState, consoleEntries } from "@evmcrispr/editor";
import type { Action, BoxSnapshot } from "@evmcrispr/sdk";
import { applyText, revisions } from "@evmcrispr/space";
import { ORIGIN } from "../../src/space/undo";
import { lockNames } from "../../src/storage/locks";
import { testBrowser } from "../helpers/app";
import { fakeEvml, type Step } from "../helpers/fake-evml";
import { settle } from "../helpers/tabs";

const to = "0x000000000000000000000000000000000000dEaD" as const;
const tx = (n: number): Action => ({ to, data: `0x0${n}` });
const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});
const receipt = { status: "success", blockNumber: 1n };
const box = (id: string, over: Partial<BoxSnapshot> = {}): BoxSnapshot => ({
  id,
  state: "live",
  title: "TWAP",
  detail: "Started",
  history: [],
  simulated: false,
  ...over,
});
const boxes = (record: { console: unknown }) =>
  Object.values((record.console as ConsoleState).boxes);

/** A tab with one space on screen and a scripted worker. */
async function setup(
  steps: Step[],
  wallet: Parameters<typeof fakeEvml>[1],
  options: Parameters<typeof fakeEvml>[2] = {},
) {
  const browser = testBrowser();
  const evml = fakeEvml(steps, wallet, options);
  const app = browser.tab({
    evml: () => evml,
    wallet: async () => ({ client: evml.wallet, address: to }),
  });
  const id = await app.spaces.create({ text: "print 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  app.spaces.show(id);
  const run = (runId: string) => app.runs.store.getState()[runId];
  const stored = (runId: string) => space.timeline.getState().runs.get(runId)!;
  const start = async (mode: "real" | "simulated" = "real") => {
    const started = await app.runs.start(id, { mode });
    if (!started.ok) throw new Error(started.reason);
    return started;
  };
  return { browser, app, evml, id, space, run, stored, start };
}

describe("run manager", () => {
  test("a run records a revision, a run entry and a record, and ends as success", async () => {
    const t = await setup(
      [{ line: 1, log: "one" }, { action: tx(1) }],
      async () => receipt,
    );
    applyText(t.space.text, "print 2", ORIGIN.user);
    const started = await t.start();
    expect(await started.ended).toBe("success");

    const [, typed] = revisions(t.space.timeline.getState());
    const record = t.stored(started.runId);
    expect(t.evml.source).toBe("print 2");
    expect(record.revisionId).toBe(typed.id);
    expect(record.status).toBe("success");
    expect(record.executedCount).toBe(1);
    expect(consoleEntries(record.console as ConsoleState)).toEqual([
      { kind: "line", text: "one" },
    ]);
    const entry = t.space.timeline.getState().entries.get(started.runId)!;
    expect(entry).toMatchObject({ kind: "run", runId: started.runId });
    expect(t.evml.terminated).toBe(true);
    expect(await t.app.locks.isHeld(lockNames.run(t.id))).toBe(false);
    expect(await t.app.locks.isHeld(lockNames.running(started.runId))).toBe(
      false,
    );
    expect((await t.app.storage.records.getSpace(t.id))?.run).toBeUndefined();
  });

  test("what runs is the script on screen, whatever the timeline says is latest", async () => {
    const t = await setup([{ line: 1 }], async () => receipt);
    // An entry from elsewhere that would sort as the latest revision.
    const { revisionId } = await import("@evmcrispr/space");
    t.space.commit({
      entries: [
        {
          kind: "revision",
          id: revisionId("exec evil", undefined),
          text: "exec evil",
          source: "user",
          author: { kind: "user" },
          ts: 9e15,
        },
      ],
    });
    const started = await t.start();
    await started.ended;
    expect(t.evml.source).toBe("print 1");
  });

  test("what runs is the text as it was when the run was asked for", async () => {
    const t = await setup([{ line: 1 }], async () => receipt);
    applyText(t.space.text, "print checked", ORIGIN.user);
    // While the lock is being granted, someone else writes to the script.
    const tryHold = t.app.locks.tryHold;
    t.app.locks.tryHold = async (name) => {
      t.space.editAsTurn("turn", { kind: "write", text: "exec evil" });
      return tryHold(name);
    };
    const started = await t.start();
    await started.ended;
    expect(t.evml.source).toBe("print checked");
    const record = t.stored(started.runId);
    expect(
      t.space.timeline.getState().entries.get(record.revisionId),
    ).toMatchObject({ kind: "revision", text: "print checked" });
  });

  test("two starts at once: one run", async () => {
    const t = await setup([{ action: tx(1) }], () => new Promise(() => {}));
    const [first, second] = await Promise.all([
      t.app.runs.start(t.id, { mode: "real" }),
      t.app.runs.start(t.id, { mode: "real" }),
    ]);
    expect([first.ok, second.ok]).toEqual([true, false]);
    expect(second).toEqual({ ok: false, reason: "busy" });
  });

  test("a space left or removed while the run was being set up starts nothing", async () => {
    const t = await setup([{ action: tx(1) }], async () => receipt);
    const tryHold = t.app.locks.tryHold;
    t.app.locks.tryHold = async (name) => {
      t.app.spaces.show("another-space");
      return tryHold(name);
    };
    expect(await t.app.runs.start(t.id, { mode: "real" })).toEqual({
      ok: false,
      reason: "off-screen",
    });
    expect(await t.app.locks.isHeld(lockNames.run(t.id))).toBe(false);
    expect(t.evml.attempts).toBe(0);
    expect(t.space.timeline.getState().runs.size).toBe(0);
  });

  test("a run can only be started for the space on screen, and once", async () => {
    const t = await setup([{ action: tx(1) }], () => new Promise(() => {}));
    t.app.spaces.show(null);
    expect(await t.app.runs.start(t.id, { mode: "real" })).toEqual({
      ok: false,
      reason: "off-screen",
    });
    t.app.spaces.show(t.id);
    await t.start();
    expect(await t.app.runs.start(t.id, { mode: "real" })).toEqual({
      ok: false,
      reason: "busy",
    });
    expect(await t.app.runs.start("nowhere", { mode: "real" })).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  test("a second tab is refused while the space is running elsewhere", async () => {
    const t = await setup([{ action: tx(1) }], () => new Promise(() => {}));
    await t.start();
    const other = t.browser.tab();
    await other.spaces.acquire(t.id);
    other.spaces.show(t.id);
    expect(await other.runs.start(t.id, { mode: "real" })).toEqual({
      ok: false,
      reason: "elsewhere",
    });
  });

  test("what is under way finishes; the next action is held", async () => {
    let confirm!: (value: unknown) => void;
    const t = await setup(
      [{ action: tx(1) }, { action: tx(2) }],
      () => new Promise((resolve) => (confirm = resolve)),
    );
    const started = await t.start();
    await settle();
    expect(t.run(started.runId).phase).toBe("awaiting-wallet");
    t.app.spaces.show("another-space"); // the prompt for tx 1 is open
    confirm(receipt); // the user confirms it anyway
    await settle();

    expect(t.evml.attempts).toBe(1); // tx 2 never reached the wallet
    const live = t.run(started.runId);
    expect(live.record.status).toBe("paused");
    expect(live.record.pausedBy).toBe("left");
    expect(live.held?.action).toEqual(tx(2));
    expect(t.evml.statuses.at(-1)).toBe("paused");
    expect(t.stored(started.runId).status).toBe("paused");
    expect((await t.app.storage.records.getSpace(t.id))?.run).toBe("paused");

    t.app.spaces.show(t.id);
    await settle();
    expect(t.run(started.runId).record.status).toBe("paused"); // never by itself
    t.app.runs.resume(started.runId);
    await settle();
    expect(t.evml.attempts).toBe(2);
    expect(t.run(started.runId).record.status).toBe("running");
    expect(t.run(started.runId).record.pausedBy).toBeUndefined();
    confirm(receipt);
    expect(await started.ended).toBe("success");
  });

  test("a refusal pauses the run and keeps its lock; Resume asks again", async () => {
    const t = await setup([{ action: tx(1) }], async (_a, attempt) => {
      if (attempt === 0) throw refusal;
      return receipt;
    });
    const started = await t.start();
    await settle();
    expect(t.run(started.runId).record.pausedBy).toBe("declined");
    expect(t.evml.statuses).toEqual(["waiting", "declined"]);
    expect(await t.app.locks.isHeld(lockNames.run(t.id))).toBe(true);
    t.app.runs.resume(started.runId);
    expect(await started.ended).toBe("success");
    expect(t.evml.statuses).toEqual(["waiting", "declined", "waiting"]);
  });

  test("Cancel after a refusal hands the refusal to the script and ends the run", async () => {
    const t = await setup([{ action: tx(1) }, { action: tx(2) }], async () => {
      throw refusal;
    });
    const started = await t.start();
    await settle();
    t.app.runs.cancel(started.runId);
    expect(await started.ended).toBe("cancelled");
    expect(t.stored(started.runId).errors).toEqual([]); // a choice, not a failure
    expect(t.evml.attempts).toBe(1);
  });

  test("Cancel ends the run even when the script would carry on past the refusal", async () => {
    // A worker whose script captures the refusal and sends another action.
    const browser = testBrowser();
    let sent = 0;
    const evml = fakeEvml([], async () => {
      if (++sent === 1) throw refusal;
      return receipt;
    });
    const capturing = {
      ...evml,
      with: () => capturing,
      script: () => ({
        simulate: evml.script("").simulate,
        async execute(client: any, execute: any) {
          const ctx = {
            onStatus() {},
            next: (action: Action) =>
              client.request({
                method: "eth_sendTransaction",
                params: [action],
              }),
          };
          await execute.handlers.transaction(tx(1), ctx).catch(() => {});
          await execute.handlers.transaction(tx(2), ctx).catch(() => {});
          return { executed: [], exited: false, logs: [] };
        },
      }),
    };
    const app = browser.tab({
      evml: () => capturing as typeof evml,
      wallet: async () => ({ client: evml.wallet, address: to }),
    });
    const id = await app.spaces.create({ text: "a", source: "user" });
    app.spaces.show(id);
    const started = await app.runs.start(id, { mode: "real" });
    if (!started.ok) throw new Error(started.reason);
    await settle();
    app.runs.cancel(started.runId);
    expect(await started.ended).toBe("cancelled");
    expect(sent).toBe(1);
  });

  test("a refused change of chain before the script pauses too; Resume asks again", async () => {
    const t = await setup(
      [{ chain: 100 }, { line: 1 }],
      async (_action, attempt) => {
        if (attempt === 0) throw refusal;
      },
    );
    const started = await t.start();
    await settle();
    const live = t.run(started.runId);
    expect(live.record.status).toBe("paused");
    expect(live.record.pausedBy).toBe("declined");
    expect(live.held?.action).toEqual({
      type: "wallet",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x64" }],
    });
    t.app.runs.resume(started.runId);
    expect(await started.ended).toBe("success");
    expect(t.evml.attempts).toBe(2);
  });

  test("an error after the transaction was sent ends the run; it is never sent again", async () => {
    // The wallet granted the request; a later step fails with an error
    // that reads as a refusal.
    const t = await setup(
      [{ action: tx(1), failsAfterSend: refusal }],
      async () => `0x${"11".repeat(32)}`,
    );
    const started = await t.start();
    expect(await started.ended).toBe("cancelled");
    expect(t.evml.attempts).toBe(1);
    expect(t.evml.statuses).toEqual(["waiting"]);
    t.app.runs.resume(started.runId);
    await settle();
    expect(t.evml.attempts).toBe(1);
  });

  test("a 4001 that did not come from the wallet's answer is an error, not a pause", async () => {
    const t = await setup([{ action: tx(1), failsAfterSend: refusal }], () =>
      Promise.reject(new Error("nonce too low")),
    );
    const started = await t.start();
    expect(await started.ended).toBe("error");
    expect(t.run(started.runId).held).toBeNull();
  });

  test("an action let through as read-only cannot reach the wallet", async () => {
    // It says it only reads; whatever sends it asks the wallet anyway.
    const t = await setup(
      [{ action: { to, data: "0x01", readOnly: true } }],
      async () => receipt,
    );
    const started = await t.start();
    expect(await started.ended).toBe("error");
    expect(t.evml.attempts).toBe(0);
    expect(t.stored(started.runId).errors[0]).toContain("held back");
  });

  test("Resume cannot push a held action out while its space is off screen", async () => {
    const t = await setup([{ action: tx(1) }], async () => receipt);
    const started = await t.start();
    await started.ended;
    const again = fakeEvml([{ action: tx(2) }], async () => receipt);
    const app = t.browser.tab({
      evml: () => again,
      wallet: async () => ({ client: again.wallet, address: to }),
    });
    await app.spaces.acquire(t.id);
    app.spaces.show(t.id);
    const second = await app.runs.start(t.id, { mode: "real" });
    if (!second.ok) throw new Error(second.reason);
    app.spaces.show("another-space");
    await settle();
    app.runs.resume(second.runId);
    app.runs.resume(second.runId);
    await settle();
    expect(again.attempts).toBe(0);
    expect(app.runs.store.getState()[second.runId].held?.reason).toBe("left");
    app.runs.cancel(second.runId);
    expect(await second.ended).toBe("cancelled");
    expect(again.attempts).toBe(0);
  });

  test("typed data is held, described and sent as one value", async () => {
    const typed = {
      types: { Note: [{ name: "text", type: "string" }] },
      primaryType: "Note",
      domain: {},
      message: { text: "hello" },
    };
    const seen: unknown[] = [];
    const t = await setup(
      [
        {
          action: {
            type: "wallet",
            method: "eth_signTypedData_v4",
            // Read differently by different parsers: a key twice.
            params: [
              to,
              JSON.stringify(typed).replace("}}", ',"text":"bye"}}'),
            ],
          },
        },
      ],
      async (action, attempt) => {
        seen.push(action);
        if (attempt === 0) throw refusal;
        return "0xsig";
      },
    );
    const started = await t.start();
    await settle();
    const held = t.run(started.runId).held?.action as { params: string[] };
    expect(JSON.parse(held.params[1]).message).toEqual({ text: "bye" });
    expect(held.params[1].match(/"text":/g)).toHaveLength(1);
    t.app.runs.resume(started.runId);
    await started.ended;
    // What reached the wallet, both times, is the held value.
    expect(seen).toEqual([held, held]);
  });

  test("any other wallet error ends the run as an error", async () => {
    const t = await setup([{ action: tx(1) }], async () => {
      throw new Error("insufficient funds");
    });
    const started = await t.start();
    expect(await started.ended).toBe("error");
    expect(t.stored(started.runId).errors).toEqual(["insufficient funds"]);
    expect(t.run(started.runId).held).toBeNull();
  });

  test("a watching run carries on when the space is left; cancelling ends its boxes", async () => {
    const t = await setup([{ line: 1, box: box("b1") }], async () => receipt, {
      hold: true,
    });
    const started = await t.start();
    await settle();
    expect(t.run(started.runId).record.status).toBe("watching");
    expect((await t.app.storage.records.getSpace(t.id))?.run).toBe("watching");
    t.app.spaces.show("another-space");
    await settle();
    expect(t.run(started.runId).record.status).toBe("watching");
    t.app.runs.cancel(started.runId);
    expect(await started.ended).toBe("cancelled");
    expect(
      boxes(t.stored(started.runId)).every((b) => b.state !== "live"),
    ).toBe(true);
  });

  test("only boxes that hold the run make it a watching one", async () => {
    const t = await setup(
      [{ line: 1, box: box("sim", { simulated: true }) }],
      async () => receipt,
      { hold: true },
    );
    const started = await t.start();
    await settle();
    expect(t.run(started.runId).record.status).toBe("running");
    t.app.runs.cancel(started.runId);
    await started.ended;
  });

  test("to stop following a script that had ended leaves the run a success", async () => {
    const t = await setup([{ line: 1, box: box("b1") }], async () => receipt, {
      hold: true,
      resolveOnAbort: true,
    });
    const started = await t.start();
    await settle();
    t.app.runs.cancel(started.runId);
    expect(await started.ended).toBe("success");
    expect(t.stored(started.runId).errors).toEqual([]);
  });

  test("a simulated run takes no space lock and is recorded as a simulation", async () => {
    const t = await setup([{ log: "sim" }], async () => receipt, {
      simulation: { success: true, actions: [tx(1)] },
    });
    t.app.spaces.show(null); // a simulation needs no screen
    const started = await t.start("simulated");
    expect(await t.app.locks.isHeld(lockNames.run(t.id))).toBe(false);
    expect(await started.ended).toBe("success");
    expect(t.stored(started.runId).mode).toBe("simulated");
    expect(t.run(started.runId).simulated?.actions).toEqual([tx(1)]);
    expect((await t.app.storage.records.getSpace(t.id))?.run).toBeUndefined();
  });

  test("the record is not written for every line of the console", async () => {
    const steps: Step[] = Array.from({ length: 50 }, (_, i) => ({
      log: `line ${i}`,
    }));
    const t = await setup(
      [...steps, { action: tx(1) }],
      () => new Promise(() => {}),
    );
    let writes = 0;
    const merge = t.app.storage.records.mergeTimeline;
    t.app.storage.records.mergeTimeline = (spaceId, patch) => {
      if (patch.runs?.length) writes++;
      return merge(spaceId, patch);
    };
    await t.start();
    await settle();
    // The start; never one per line.
    expect(writes).toBeLessThan(4);
  });

  test("a run nobody holds is interrupted, with its live boxes ended", async () => {
    const t = await setup(
      [{ box: box("b1") }, { action: tx(1) }],
      () => new Promise(() => {}),
    );
    const started = await t.start();
    await settle();
    const other = t.browser.tab();
    const space = (await other.spaces.acquire(t.id))!;
    await other.runs.adopt(space);
    // Held by the first tab: left alone.
    expect(space.timeline.getState().runs.get(started.runId)?.status).toBe(
      "running",
    );
    // The tab closes: the browser releases its locks; nothing else is told.
    t.browser.closeTab(t.app);
    await settle();
    const record = space.timeline.getState().runs.get(started.runId)!;
    expect(record.status).toBe("interrupted");
    expect(boxes(record)[0].state).toBe("cancelled");
    expect((await other.storage.records.getSpace(t.id))?.run).toBeUndefined();
    other.spaces.show(t.id);
    expect((await other.runs.start(t.id, { mode: "real" })).ok).toBe(true);
  });

  test("cancelling one run leaves another space's run alive", async () => {
    const browser = testBrowser();
    const evmls = [
      fakeEvml([{ line: 1, box: box("a") }], async () => receipt, {
        hold: true,
      }),
      fakeEvml([{ line: 1, box: box("b") }], async () => receipt, {
        hold: true,
      }),
    ];
    let next = 0;
    const app = browser.tab({
      evml: () => evmls[next++],
      wallet: async () => ({ client: evmls[0].wallet, address: to }),
    });
    const a = await app.spaces.create({ text: "a", source: "user" });
    const b = await app.spaces.create({ text: "b", source: "user" });
    app.spaces.show(a);
    const first = await app.runs.start(a, { mode: "real" });
    app.spaces.show(b);
    const second = await app.runs.start(b, { mode: "real" });
    if (!first.ok || !second.ok) throw new Error("both runs should start");
    await settle();

    app.runs.cancel(first.runId);
    expect(await first.ended).toBe("cancelled");
    expect(evmls[0].terminated).toBe(true);
    expect(evmls[1].terminated).toBe(false);
    expect(app.runs.store.getState()[second.runId].record.status).toBe(
      "watching",
    );
  });

  test("Cancel ends a run whose wallet never answers the change of chain", async () => {
    const t = await setup(
      [{ chain: 100 }, { line: 1 }],
      () => new Promise(() => {}),
    );
    const started = await t.start();
    await settle();
    t.app.runs.cancel(started.runId);
    expect(await started.ended).toBe("cancelled");
    expect(await t.app.locks.isHeld(lockNames.run(t.id))).toBe(false);
    expect(t.evml.terminated).toBe(true);
    expect(t.run(started.runId).record.status).toBe("cancelled");
  });

  test("a run that ended elsewhere is not marked interrupted from a stale copy", async () => {
    const t = await setup([], async () => receipt);
    const stale = {
      id: "r1",
      revisionId: "",
      mode: "real" as const,
      status: "running" as const,
      startedAt: 5,
      by: { kind: "user" as const },
      console: { slots: [], boxes: {}, live: 0 },
      errors: [],
      output: "",
      executedCount: 0,
      updatedAt: 5,
    };
    t.space.commit({ runs: [stale] });
    await settle();
    // Its runner wrote the end; the news has not reached this tab.
    await t.app.storage.records.mergeTimeline(t.id, {
      runs: [{ ...stale, status: "success", updatedAt: 6 }],
    });
    await t.app.runs.adopt(t.space);
    expect(t.space.timeline.getState().runs.get("r1")?.status).toBe("success");
    const stored = await t.app.storage.records.loadTimeline(t.id);
    expect(stored.runs.find((run) => run.id === "r1")?.status).toBe("success");
  });

  test("a record from elsewhere dated in the future does not freeze a run's own", async () => {
    let confirm!: (value: unknown) => void;
    const t = await setup(
      [{ action: tx(1) }],
      () => new Promise((resolve) => (confirm = resolve)),
    );
    const started = await t.start();
    await settle();
    t.space.commit({
      runs: [{ ...t.stored(started.runId), updatedAt: 9e15 }],
    });
    confirm(receipt);
    expect(await started.ended).toBe("success");
    expect(t.stored(started.runId).status).toBe("success");
  });

  test("removing a space ends its run", async () => {
    const t = await setup([{ action: tx(1) }], () => new Promise(() => {}));
    const started = await t.start();
    await settle();
    await t.app.spaces.remove(t.id);
    expect(await started.ended).toBe("cancelled");
    expect(t.evml.terminated).toBe(true);
    expect(await t.app.storage.records.loadTimeline(t.id)).toEqual({
      entries: [],
      runs: [],
      removals: [],
    });
  });
});
