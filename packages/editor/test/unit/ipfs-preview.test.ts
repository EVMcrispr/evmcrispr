import { describe, expect, it } from "bun:test";
import { opensAsSvg } from "../../src/editor/ipfs-preview";

describe("opensAsSvg", () => {
  it("finds the svg element after a declaration and comments", () => {
    expect(opensAsSvg("<svg xmlns='http://www.w3.org/2000/svg'>")).toBe(true);
    expect(opensAsSvg("  <svg>")).toBe(true);
    expect(
      opensAsSvg(
        '<?xml version="1.0"?>\n<!-- made by hand -->\n<!---->  <svg\nwidth="1">',
      ),
    ).toBe(true);
  });

  it("refuses what does not open with one", () => {
    expect(opensAsSvg("<html><svg>")).toBe(false);
    expect(opensAsSvg("<svgx>")).toBe(false);
    expect(opensAsSvg("<!-- never closed <svg>")).toBe(false);
    expect(opensAsSvg("<!-- a --> text <svg>")).toBe(false);
    expect(opensAsSvg("")).toBe(false);
  });

  it("answers at once on comments that no svg follows", () => {
    // 2048 bytes is all a preview reads; 227 of these took 38 s as one
    // pattern.
    const text = `${"<!---->".repeat(290)}<p>`;
    const start = performance.now();

    expect(opensAsSvg(text)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
