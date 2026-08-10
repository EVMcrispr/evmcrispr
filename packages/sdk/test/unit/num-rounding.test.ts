import { describe, expect, it } from "bun:test";

import { Num } from "../../src";

/** 1000e18/mo as the interpreter builds it: an exact rational, not a
 *  pre-floored integer. 10^21 / 2592000 = 385802469135802.46… */
const RATE_PER_MONTH = Num(10n ** 21n).div(Num(2592000n));

describe("Num rounding", () => {
  it("leaves whole numbers alone in every direction", () => {
    const n = Num(-7n);
    expect(n.toBigInt()).toBe(-7n);
    expect(n.floorBigInt()).toBe(-7n);
    expect(n.ceilBigInt()).toBe(-7n);
  });

  it("floors and ceils a positive fraction", () => {
    const half = Num("0.5");
    expect(half.floorBigInt()).toBe(0n);
    expect(half.ceilBigInt()).toBe(1n);

    const almostTwo = Num("1.9");
    expect(almostTwo.floorBigInt()).toBe(1n);
    expect(almostTwo.ceilBigInt()).toBe(2n);
  });

  it("floors a negative fraction away from zero, unlike toBigInt", () => {
    const n = Num("-1.9");
    // toBigInt truncates toward zero — the reason floor/ceil exist.
    expect(n.toBigInt()).toBe(-1n);
    expect(n.floorBigInt()).toBe(-2n);
    expect(n.ceilBigInt()).toBe(-1n);
  });

  it("rounds a rate literal exactly", () => {
    expect(RATE_PER_MONTH.isInteger()).toBe(false);
    expect(RATE_PER_MONTH.floorBigInt()).toBe(385802469135802n);
    // The smallest rate that actually satisfies `>= 1000e18/mo`.
    expect(RATE_PER_MONTH.ceilBigInt()).toBe(385802469135803n);
  });

  it("keeps floor <= value <= ceil for both signs", () => {
    for (const s of ["3.25", "-3.25", "0.001", "-0.001"]) {
      const n = Num(s);
      const floor = n.floorBigInt();
      const ceil = n.ceilBigInt();
      expect(Num(floor).lte(n)).toBe(true);
      expect(Num(ceil).gte(n)).toBe(true);
      expect(ceil - floor).toBe(1n);
    }
  });
});
