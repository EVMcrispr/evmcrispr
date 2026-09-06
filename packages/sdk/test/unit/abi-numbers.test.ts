import { describe, expect, test } from "bun:test";
import { parseAbiParameters } from "viem";
import {
  coerceAbiValue,
  isSignedInteger,
  Num,
  preserveAbiReturnNumbers,
} from "../../src";

describe("ABI numeric boundaries", () => {
  test("does not truncate fractions inside arrays or tuples", () => {
    const type = parseAbiParameters("(uint8,int16[])[]")[0];
    expect(coerceAbiValue(type, [[Num(255), [Num(-32768)]]])).toEqual([
      [255n, [-32768n]],
    ]);
    expect(() => coerceAbiValue(type, [[Num(256), []]])).toThrow("uint8");
    expect(() => coerceAbiValue(type, [[Num(1), [Num(1n, 2n)]]])).toThrow(
      "exact integer",
    );
  });
  test("retains positive signed provenance through nested ABI values", () => {
    const type = parseAbiParameters("(int16[],uint16)");
    const value = preserveAbiReturnNumbers(type, [[1, -2], 3]) as [
      Num[],
      number,
    ];
    expect(value[0].map(isSignedInteger)).toEqual([true, true]);
    expect(value[1]).toBe(3);
  });
});
