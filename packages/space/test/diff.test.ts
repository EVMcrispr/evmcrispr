import { describe, expect, test } from "bun:test";
import { changedLines, lineDiff, lineStats, revertChange } from "../src/diff";

describe("diff", () => {
  test("stats and changed lines", () => {
    expect(lineStats("a\nb\nc", "a\nB\nc\nd")).toEqual({
      added: 2,
      removed: 1,
    });
    expect(changedLines("a\nb\nc", "a\nB\nc\nd")).toEqual([2, 4]);
    expect(lineDiff("a\nb", "a\nc").map((l) => l.kind)).toEqual([
      "same",
      "removed",
      "added",
    ]);
  });
  test("revert keeps later edits, refuses overlap", () => {
    expect(revertChange("a\nB\nc\nd", "a\nB\nc", "a\nb\nc")).toBe("a\nb\nc\nd");
    expect(revertChange("a\nX\nc", "a\nB\nc", "a\nb\nc")).toBeNull();
  });
});
