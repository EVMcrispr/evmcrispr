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
      label: "Segment 2 opens in",
      due: "Segment 2 opening now",
      from: 1000,
      until: 1060,
    };
    expect(countdownText(next, 1030)).toBe("Segment 2 opens in 30s");
    expect(countdownText(next, 1060)).toBe("Segment 2 opening now");
    // Without a due text, the label stays.
    expect(countdownText({ label: "Ends in", from: 0, until: 10 }, 10)).toBe(
      "Ends in",
    );
  });

  const window = { label: "Segment 2 closes in", from: 100, until: 160 };

  it("grows the running step with its time, faint until it executes", () => {
    expect(
      segments([1, 4], window, 130, [
        { state: "done" },
        { state: "open", current: true },
        { state: "pending" },
        { state: "pending" },
      ]),
    ).toEqual([
      { kind: "done", fill: 1, href: undefined },
      { kind: "open", fill: 0.5 },
      { kind: "pending" },
      { kind: "pending" },
    ]);
  });

  it("keeps growing a step executed early, in solid colour, until its time is up", () => {
    const opens = { label: "Segment 3 opens in", from: 100, until: 160 };
    const early = segments([2, 4], opens, 130, [
      { state: "done", href: "https://explorer.cow.fi/gc/orders/0x1" },
      {
        state: "done",
        current: true,
        href: "https://explorer.cow.fi/gc/orders/0x2",
      },
      { state: "pending" },
      { state: "pending" },
    ]);
    expect(early?.[1]).toEqual({
      kind: "done",
      fill: 0.5,
      href: "https://explorer.cow.fi/gc/orders/0x2",
    });
    // The next step has not opened: it waits empty.
    expect(early?.[2]).toEqual({ kind: "pending" });
    // Once the countdown is gone (the box ended), done steps are full.
    expect(
      segments([1, 1], undefined, 0, [{ state: "done", current: true }])?.[0],
    ).toEqual({ kind: "done", fill: 1, href: undefined });
  });

  it("hatches missed steps, whatever order steps complete in", () => {
    expect(
      segments([2, 4], window, 130, [
        { state: "done" },
        { state: "missed" },
        { state: "done" },
        { state: "open", current: true },
      ])?.map((s) => s.kind),
    ).toEqual(["done", "missed", "done", "open"]);
  });

  it("without steps, fills the first done and grows the countdown's segment", () => {
    expect(segments([1, 3], { ...window, segment: 1 }, 130)).toEqual([
      { kind: "done", fill: 1 },
      { kind: "open", fill: 0.5 },
      { kind: "pending" },
    ]);
    expect(
      segments([1, 3], undefined, 0, [{ state: "done" }])?.map((s) => s.kind),
    ).toEqual(["done", "pending", "pending"]);
  });

  it("falls back to a plain bar with too many steps", () => {
    expect(segments([0, MAX_SEGMENTS + 1], undefined, 0)).toBeNull();
  });
});
