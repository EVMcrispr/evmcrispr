import { describe, expect, test } from "bun:test";
import { decimalPrecision, parseDecimal } from "../../src/helpers/_decimal";

describe("decimal parsing", () => {
  test("rounds after scaling with a signed remainder", () => {
    expect(parseDecimal("-1.239", 2, "trunc")).toBe(-123n);
    expect(parseDecimal("-1.239", 2, "floor")).toBe(-124n);
    expect(parseDecimal("-1.239", 2, "ceil")).toBe(-123n);
    expect(parseDecimal("+.5", 0, "ceil")).toBe(1n);
    expect(parseDecimal("1.", 3)).toBe(1000n);
  });
  test("checks the rounded destination range", () => {
    const max = (1n << 256n) - 1n;
    expect(parseDecimal(`${max}.9`, 0, "trunc", "unsigned")).toBe(max);
    expect(() => parseDecimal(`${max}.9`, 0, "ceil", "unsigned")).toThrow(
      "overflows",
    );
    expect(parseDecimal(String(-(1n << 255n)), 0)).toBe(-(1n << 255n));
    expect(() => parseDecimal(String(1n << 255n), 0)).toThrow("overflows");
  });
  test("rejects non-contract syntax and invalid precision", () => {
    for (const value of ["", ".", "1e3", " 1", "1 ", "1_000", "++1", "1.2.3"])
      expect(() => parseDecimal(value, 0)).toThrow();
    expect(() => parseDecimal("-0", 0, "trunc", "unsigned")).toThrow();
    for (const d of [-1, 78, 0.5]) expect(() => decimalPrecision(d)).toThrow();
  });
});
