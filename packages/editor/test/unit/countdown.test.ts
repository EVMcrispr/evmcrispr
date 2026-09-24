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

  it("reads the label with the time left, then its due text", () => {
    const next = {
      label: "Next settlement in",
      due: "Settlement landing soon",
      from: 1000,
      until: 1060,
      segment: 2,
    };
    expect(countdownText(next, 1030)).toBe("Next settlement in 30s");
    expect(countdownText(next, 1060)).toBe("Settlement landing soon");
    // Without a due text, the label stays.
    expect(countdownText({ label: "Ends in", from: 0, until: 10 }, 10)).toBe(
      "Ends in",
    );
  });

  it("fills settled steps, and the step the countdown leads to faintly", () => {
    // 2 of 4 settled; the countdown leads to step index 2, half way there.
    const next = {
      label: "Next settlement in",
      from: 100,
      until: 160,
      segment: 2,
    };
    expect(segments([2, 4], next, 130)).toEqual([
      { kind: "done" },
      { kind: "done" },
      { kind: "upcoming", fill: 0.5 },
      { kind: "pending" },
    ]);
    // Only 1 settled: the step in between waits empty.
    expect(segments([1, 4], next, 130)?.map((s) => s.kind)).toEqual([
      "done",
      "pending",
      "upcoming",
      "pending",
    ]);
  });

  it("a settled step stays full even if its time has not come", () => {
    const next = {
      label: "Next settlement in",
      from: 100,
      until: 160,
      segment: 2,
    };
    expect(segments([3, 4], next, 130)?.[2]).toEqual({ kind: "done" });
  });

  it("without a countdown step nothing fills; done steps still show", () => {
    expect(segments([2, 4], undefined, 0)?.map((s) => s.kind)).toEqual([
      "done",
      "done",
      "pending",
      "pending",
    ]);
    const end = { label: "Ends in", from: 180, until: 240 };
    expect(segments([3, 4], end, 200)?.[3]).toEqual({ kind: "pending" });
  });

  it("falls back to a plain bar with too many steps", () => {
    expect(segments([0, MAX_SEGMENTS + 1], undefined, 0)).toBeNull();
  });
});
