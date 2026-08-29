import { describe, expect, it } from "bun:test";
import { sliceNodeText } from "../../src/utils/sliceNodeText";

describe("sliceNodeText", () => {
  const lines = [
    "load token",
    "sim:fork (",
    "  set $x 1",
    "  exec $a f() $x",
    ")",
  ];

  it("slices a single-line node", () => {
    const node = {
      type: 0,
      loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 10 } },
    } as any;
    expect(sliceNodeText(lines, node)).toBe("load token");
  });

  it("slices a multi-line node inclusive of both ends", () => {
    const node = {
      type: 0,
      loc: { start: { line: 2, col: 9 }, end: { line: 5, col: 1 } },
    } as any;
    expect(sliceNodeText(lines, node)).toBe(
      "(\n  set $x 1\n  exec $a f() $x\n)",
    );
  });

  it("returns undefined without a loc", () => {
    expect(sliceNodeText(lines, { type: 0 } as any)).toBeUndefined();
  });
});
