import { describe, expect, it } from "bun:test";
import type { BoxHandle, BoxUpdate, WatchContext } from "@evmcrispr/sdk";
import { partStep, twapCountdown, watchTwap } from "../../src/twap/watch";

function fakeBox() {
  const log: string[] = [];
  const links: Record<string, string> = {};
  let progress: [number, number] | undefined;
  let state = "live";
  const controller = new AbortController();
  const box: BoxHandle = {
    id: "b",
    signal: controller.signal,
    simulated: false,
    update: (u: BoxUpdate) => {
      if (u.detail) log.push(u.detail);
      if (u.progress) progress = u.progress;
      Object.assign(links, u.links);
    },
    done: (d) => {
      state = "done";
      log.push(d);
    },
    fail: (d) => {
      state = "failed";
      log.push(d);
    },
    cancel: (d) => {
      state = "cancelled";
      log.push(d);
    },
    watch: () => {},
    poll: async (step) => {
      while (state === "live") {
        try {
          if ((await step()) === "stop") return;
        } catch {
          log.push("Reconnecting…");
        }
      }
    },
  };
  return { box, log, links, state: () => state, progress: () => progress };
}
const ctx = (kind: WatchContext["outcome"]["kind"]): WatchContext => ({
  outcome:
    kind === "confirmed"
      ? { kind }
      : ({ kind, reason: `because ${kind}` } as WatchContext["outcome"]),
  signal: new AbortController().signal,
  simulated: false,
});
// 2026-09-24 14:05 UTC, four hourly parts.
const START = Date.UTC(2026, 8, 24, 14, 5) / 1000;
/** The watcher's UTC format: "2026-01-01 14:05 UTC". */
const AT_START = `${new Date(START * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const HOURLY = {
  start: String(START),
  end: String(START + 4 * 3600),
};
const ref = {
  chainId: 100,
  account: "0x1c5b66503ed58070f6b0a53472cca49ce533df02",
} as any;

describe("watchTwap", () => {
  it("fails with the carrier's reason when the registration never happened", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, {} as any, ctx("rejected"));
    expect(state()).toBe("failed");
    expect(log.at(-1)).toBe("Not registered: because rejected");
  });

  it("reports progress, then finishes when every part is filled", async () => {
    const { box, log, links, state, progress } = fakeBox();
    const statuses = [
      {
        registered: true,
        schedule: "active",
        filledParts: 0,
        totalParts: 4,
        filled: "none",
        submission: { partIndex: 0, explorer: "https://part/0" },
        ...HOURLY,
      },
      {
        registered: true,
        schedule: "active",
        filledParts: 1,
        totalParts: 4,
        filled: "partial",
        submission: { partIndex: 1, explorer: "https://part/1" },
      },
      {
        registered: true,
        schedule: "expired",
        filledParts: 4,
        totalParts: 4,
        filled: "complete",
        submission: { partIndex: 3 },
      },
    ];
    let i = 0;
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => statuses[i++] as any,
    });
    expect(log).toEqual([
      `Started at ${AT_START}`,
      "1/4 executed",
      "Finished: 4/4 executed",
    ]);
    expect(state()).toBe("done");
    expect(progress()).toEqual([4, 4]);
    // No visible links: settlements are linked from the bar's segments.
    expect(links).toEqual({});
  });

  it("says when the order started, without naming parts", async () => {
    const { box, log } = fakeBox();
    const statuses = [
      {
        registered: true,
        schedule: "active",
        filledParts: 0,
        totalParts: 4,
        filled: "none",
        submission: { partIndex: 1 },
        ...HOURLY,
      },
      {
        registered: true,
        schedule: "expired",
        filledParts: 4,
        totalParts: 4,
        filled: "complete",
        submission: { partIndex: 3 },
      },
    ];
    let i = 0;
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => statuses[i++] as any,
    });
    expect(log[0]).toBe(`Started at ${AT_START}`);
  });

  it("ends with the executed count when the schedule expires unfilled", async () => {
    const { box, log, progress } = fakeBox();
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () =>
        ({
          registered: true,
          schedule: "expired",
          filledParts: 3,
          totalParts: 4,
          filled: "partial",
          submission: { partIndex: 3 },
        }) as any,
    });
    expect(log.at(-1)).toBe("Ended: 3/4 executed, 1 expired");
    expect(progress()).toEqual([3, 4]);
  });

  it("ends cancelled-on-chain when the order was removed", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () =>
        ({
          registered: false,
          cancelled: true,
          schedule: "unregistered",
          filledParts: 1,
          totalParts: 4,
          filled: "partial",
          submission: { partIndex: null },
        }) as any,
    });
    expect(log.at(-1)).toBe("Cancelled on-chain after 1/4 executed");
    expect(state()).toBe("cancelled");
  });

  it("finishes when every part filled even if the order was removed afterwards", async () => {
    const { box, log } = fakeBox();
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () =>
        ({
          registered: false,
          cancelled: true,
          schedule: "unregistered",
          filledParts: 4,
          totalParts: 4,
          filled: "complete",
          submission: { partIndex: null },
        }) as any,
    });
    expect(log.at(-1)).toBe("Finished: 4/4 executed");
  });

  const unknown = (overrides: Record<string, unknown>) =>
    ({
      registered: true,
      cancelled: null,
      schedule: "expired",
      filledParts: 0,
      totalParts: 4,
      filled: "unknown",
      evidence: {
        complete: false,
        reasons: ["History request budget exhausted"],
      },
      submission: { partIndex: 3 },
      ...overrides,
    }) as any;

  it("retries instead of ending when fills are unknown at expiry", async () => {
    const { box, log, progress } = fakeBox();
    const statuses = [
      unknown({}),
      {
        registered: true,
        schedule: "expired",
        filledParts: 3,
        totalParts: 4,
        filled: "partial",
        evidence: { complete: true, reasons: [] },
        submission: { partIndex: 3 },
      },
    ];
    let i = 0;
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => statuses[i++] as any,
    });
    expect(log).toEqual([
      "Ended; confirming fills…",
      "Ended: 3/4 executed, 1 expired",
    ]);
    expect(progress()).toEqual([3, 4]);
  });

  it("ends saying the fill count is unverified when fills stay unknown", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => unknown({}),
    });
    expect(log).not.toContain("Reconnecting…");
    expect(log.filter((l) => l === "Ended; confirming fills…").length).toBe(4);
    expect(log.at(-1)).toBe(
      "Ended; fill count could not be verified: History request budget exhausted",
    );
    expect(state()).toBe("done");
  });

  it("shows unknown fills while live instead of a start detail", async () => {
    const { box, log } = fakeBox();
    const statuses = [
      unknown({ schedule: "active", submission: { partIndex: 1 } }),
      {
        registered: true,
        schedule: "expired",
        filledParts: 4,
        totalParts: 4,
        filled: "complete",
        submission: { partIndex: 3 },
      },
    ];
    let i = 0;
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => statuses[i++] as any,
    });
    expect(log[0]).toBe("Fills unknown: History request budget exhausted");
  });

  it("ends when a seen order is no longer registered without history", async () => {
    const { box, log, state } = fakeBox();
    const statuses = [
      {
        registered: true,
        schedule: "active",
        filledParts: 1,
        totalParts: 4,
        filled: "partial",
        evidence: { complete: true, reasons: [] },
        submission: { partIndex: 1 },
      },
      ...Array.from({ length: 6 }, () =>
        unknown({ registered: false, schedule: "unregistered" }),
      ),
    ];
    let i = 0;
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () => statuses[Math.min(i++, statuses.length - 1)] as any,
    });
    expect(log.at(-1)).toBe(
      "No longer registered on-chain; fill count could not be verified: History request budget exhausted",
    );
    expect(log).toContain("No longer registered on-chain; confirming fills…");
    expect(state()).toBe("cancelled");
  });

  it("stops waiting for an order that never appears after a grace period", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, ref, ctx("confirmed"), {
      status: async () =>
        ({
          registered: false,
          cancelled: null,
          schedule: "unregistered",
          filledParts: 0,
          totalParts: 4,
          filled: "none",
          evidence: { complete: true, reasons: [] },
          submission: { partIndex: null },
        }) as any,
    });
    expect(log.at(-1)).toBe("No longer registered on-chain after 0/4 executed");
    expect(state()).toBe("done");
  });

  it("ends immediately in a simulation", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, {} as any, {
      ...ctx("confirmed"),
      simulated: true,
    });
    expect(log.at(-1)).toBe(
      "Registered (simulated; nothing settles in a fork)",
    );
    expect(state()).toBe("done");
  });

  const notSent = (reason: string): WatchContext => ({
    ...ctx("not-sent"),
    outcome: { kind: "not-sent", reason },
  });

  it("ends as prepared when nothing was sent", async () => {
    for (const reason of ["Not sent (dry run)", "Not sent"]) {
      const { box, log, state } = fakeBox();
      await watchTwap(box, {} as any, {} as any, notSent(reason));
      expect(log.at(-1)).toBe("Prepared, not sent");
      expect(state()).toBe("done");
    }
  });

  it("points to twapStatus when the registration went out unfollowed", async () => {
    const { box, log, state } = fakeBox();
    await watchTwap(box, {} as any, {} as any, {
      ...ctx("not-sent"),
      outcome: {
        kind: "unknown",
        reason: `Queued in the Safe as 0x${"ab".repeat(32)}`,
      },
    });
    expect(log.at(-1)).toBe(
      `Queued in the Safe as 0x${"ab".repeat(32)}; check it later with @swaps:twapStatus`,
    );
    expect(state()).toBe("done");
  });
});

describe("twapCountdown", () => {
  // Four parts of 60 s from t=1000: parts start at 1000, 1060, 1120, 1180.
  const status = (over: Record<string, unknown>) =>
    ({
      start: "1000",
      end: "1240",
      totalParts: 4,
      schedule: "active",
      submission: { partIndex: 1 },
      filledParts: 0,
      ...over,
    }) as any;

  it("counts down to the start of a scheduled order", () => {
    expect(twapCountdown(status({ schedule: "scheduled" }))).toEqual({
      label: "Starts in",
      due: "Starting now",
      from: 1000,
      until: 1000,
      segment: 0,
    });
  });

  it("counts down to the next settlement, filling the first unsettled step", () => {
    // Nothing settled yet: the first segment fills, never the second.
    expect(twapCountdown(status({}))).toEqual({
      label: "Next segment in",
      due: "Segment landing soon",
      from: 1060,
      until: 1120,
      segment: 0,
    });
    expect(twapCountdown(status({ filledParts: 1 }))?.segment).toBe(1);
  });

  it("counts down to the end during the last part", () => {
    expect(
      twapCountdown(status({ submission: { partIndex: 3 }, filledParts: 2 })),
    ).toEqual({
      label: "Ends in",
      due: "Ending now",
      from: 1180,
      until: 1240,
      segment: 2,
    });
    // All settled: nothing left to fill.
    expect(
      twapCountdown(status({ submission: { partIndex: 3 }, filledParts: 4 }))
        ?.segment,
    ).toBeUndefined();
  });

  it("has nothing to count once ended or when the schedule is unknown", () => {
    expect(twapCountdown(status({ schedule: "expired" }))).toBeNull();
    expect(twapCountdown(status({ start: null }))).toBeNull();
  });
});

describe("partStep", () => {
  const item = (window: string, filled: string) => ({
    window,
    filled,
    explorer: "https://explorer.cow.fi/gc/orders/0xabc",
  });

  it("maps each part to its own bar state", () => {
    expect(partStep(item("expired", "complete"))).toEqual({
      state: "done",
      href: "https://explorer.cow.fi/gc/orders/0xabc",
    });
    // Settled early, while its window is still open: done wins.
    expect(partStep(item("active", "complete")).state).toBe("done");
    expect(partStep(item("active", "none"))).toEqual({ state: "open" });
    expect(partStep(item("expired", "none"))).toEqual({ state: "missed" });
    expect(partStep(item("scheduled", "none"))).toEqual({ state: "pending" });
  });

  it("never calls a part missed while its fill history is incomplete", () => {
    expect(partStep(item("expired", "unknown"))).toEqual({ state: "pending" });
  });
});
