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

  it("fills the counted step and marks unsettled earlier steps as passed", () => {
    // 1 of 4 settled, waiting on step 2 (index 2), half way through it.
    expect(
      segments(
        [1, 4],
        { label: "Next part in", from: 100, until: 160, segment: 2 },
        130,
      ),
    ).toEqual([
      { kind: "done" },
      { kind: "passed" },
      { kind: "current", fill: 0.5 },
      { kind: "pending" },
    ]);
  });

  it("clamps the fill and falls back when there are too many steps", () => {
    const c = { label: "Next part in", from: 100, until: 160, segment: 0 };
    expect(segments([0, 2], c, 500)?.[0]).toEqual({ kind: "current", fill: 1 });
    expect(segments([0, 2], c, 50)?.[0]).toEqual({ kind: "current", fill: 0 });
    expect(segments([0, MAX_SEGMENTS + 1], c, 130)).toBeNull();
  });
});
