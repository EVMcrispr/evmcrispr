import { describe, expect, it } from "bun:test";
import { Num } from "../../src";

/**
 * `Num` accepts a JS number.
 *
 * viem decodes any int of 48 bits or fewer as a JS number rather than a
 * bigint, so a `decimals()(uint8)` read arrives as one. `isNum` has always
 * accepted numbers while the factory refused them, and that disagreement made
 * every arithmetic expression over such a read throw.
 */
describe("Num from a JS number", () => {
  it("converts an integer exactly", () => {
    expect(Num(18).toBigInt()).toBe(18n);
    expect(Num(0).toBigInt()).toBe(0n);
    expect(Num(-7).toBigInt()).toBe(-7n);
  });

  it("converts a fraction through its shortest round-trip decimal", () => {
    // 1/10 exactly, not a binary approximation of it.
    expect(Num(0.1).eq(Num(1n, 10n))).toBe(true);
    expect(Num(1.5).eq(Num(3n, 2n))).toBe(true);
  });

  it("expands exponent notation, which BigInt cannot parse", () => {
    expect(Num(1e-7).eq(Num(1n, 10_000_000n))).toBe(true);
    expect(Num(1.5e-7).eq(Num(15n, 100_000_000n))).toBe(true);
  });

  it("agrees with a bigint and a decimal string for the same value", () => {
    expect(Num(18).eq(Num(18n))).toBe(true);
    expect(Num(0.25).eq(Num("0.25"))).toBe(true);
  });

  it("refuses a number that has already lost digits", () => {
    // 2^53 + 1 is not representable, so converting would invent precision.
    expect(() => Num(1e21)).toThrow(/past the range/);
    expect(() => Num(Number.MAX_SAFE_INTEGER + 2)).toThrow(/past the range/);
  });

  it("refuses non-finite numbers", () => {
    expect(() => Num(Number.NaN)).toThrow(/Cannot coerce/);
    expect(() => Num(Number.POSITIVE_INFINITY)).toThrow(/Cannot coerce/);
  });
});
