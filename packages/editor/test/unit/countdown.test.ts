import { describe, expect, it } from "bun:test";
import {
  countdownText,
  formatDuration,
  MAX_SEGMENTS,
  segments,
} from "../../src/console/countdown";

describe("countdown", () => {
  it("formats the two most significant units", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(252)).toBe("4m 12s");
    expect(formatDuration(7500)).toBe("2h 05m");
    expect(formatDuration(3 * 86400 + 4 * 3600 + 59)).toBe("3d 4h");
    expect(formatDuration(0.2)).toBe("1s");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("reads the label with the time left, then what is due", () => {
    const next = { label: "Next part in", from: 1000, until: 1060, segment: 1 };
    expect(countdownText(next, 1030)).toBe("Next part in 30s");
    expect(countdownText(next, 1060)).toBe("Next part due now");
    expect(countdownText({ label: "Starts in", from: 5, until: 5 }, 9)).toBe(
      "Starting now",
    );
    expect(countdownText({ label: "Ends in", from: 0, until: 10 }, 10)).toBe(
      "Ending now",
    );
  });

  it("fills settled steps, and the next step faintly until it opens", () => {
    // Part index 1 is running, 2 of 4 settled already; part index 2 opens
    // at 160 and we are half way there.
    const next = { label: "Next part in", from: 100, until: 160, segment: 1 };
    expect(segments([2, 4], next, 130)).toEqual([
      { kind: "done" },
      { kind: "done" },
      { kind: "upcoming", fill: 0.5 },
      { kind: "pending" },
    ]);
    // Only 1 settled: the running part waits empty, the next one fills.
    expect(segments([1, 4], next, 130)?.map((s) => s.kind)).toEqual([
      "done",
      "pending",
      "upcoming",
      "pending",
    ]);
  });

  it("a settled step stays full even if its time has not come", () => {
    const next = { label: "Next part in", from: 100, until: 160, segment: 1 };
    expect(segments([3, 4], next, 130)?.[2]).toEqual({ kind: "done" });
  });

  it("nothing fills in the last part; the first part fills before the start", () => {
    const end = { label: "Ends in", from: 180, until: 240, segment: 3 };
    expect(segments([2, 4], end, 200)?.map((s) => s.kind)).toEqual([
      "done",
      "done",
      "pending",
      "pending",
    ]);
    const start = { label: "Starts in", from: 0, until: 100, segment: 0 };
    expect(segments([0, 4], start, 50)?.[0]).toEqual({
      kind: "upcoming",
      fill: 0.5,
    });
  });

  it("falls back without a step or with too many", () => {
    const c = { label: "Next part in", from: 100, until: 160, segment: 0 };
    expect(segments([0, MAX_SEGMENTS + 1], c, 130)).toBeNull();
    expect(
      segments([0, 2], { label: "Ends in", from: 0, until: 1 }, 0),
    ).toBeNull();
  });
});
