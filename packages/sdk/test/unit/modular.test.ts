import { describe, expect, it } from "bun:test";
import {
  evaluateCheckedExpression,
  INT256_MIN,
  modularPower,
  Num,
  UINT256_MAX,
} from "../../src";

describe("modular powers and inverses", () => {
  it("matches a brute-force inverse oracle for small rings", () => {
    for (let m = 1n; m < 25n; m++) {
      for (let a = 0n; a < 25n; a++) {
        let inverse: bigint | undefined;
        for (let i = 0n; i < m; i++)
          if ((a * i) % m === 1n % m) {
            inverse = i;
            break;
          }
        if (inverse === undefined)
          expect(() => modularPower(a, -1n, m)).toThrow(
            "inverse does not exist",
          );
        else {
          expect(modularPower(a, -1n, m)).toBe(inverse);
          expect(modularPower(-a, -1n, -m)).toBe(-inverse);
          expect(modularPower(-a, -2n, -m)).toBe((inverse * inverse) % m);
        }
      }
    }
  });
  it("handles full-width operands and exponents without expanding powers", () => {
    expect(modularPower(2n, -1n, UINT256_MAX)).toBe(1n << 255n);
    expect(modularPower(UINT256_MAX, -1n, UINT256_MAX - 1n)).toBe(1n);
    expect(modularPower(-1n, INT256_MIN, INT256_MIN)).toBe(1n);
    expect(modularPower(2n, UINT256_MAX, 7n)).toBe(1n);
    expect(modularPower(0n, 0n, 7n)).toBe(1n);
    expect(modularPower(0n, -1n, 1n)).toBe(0n);
    expect(() => modularPower(0n, -1n, 7n)).toThrow("inverse does not exist");
    expect(() => modularPower(1n, 0n, 0n)).toThrow("zero");
    expect(() => modularPower(1n, -1n, 0n)).toThrow("zero");
  });
  it("keeps inverse exponents independent of checked base/modulus signedness", () => {
    const calc = (a: bigint, e: bigint, m: bigint) =>
      evaluateCheckedExpression([Num(a), "^", Num(e), "%", Num(m)]).toBigInt();
    expect(calc(2n, -1n, UINT256_MAX)).toBe(1n << 255n);
    expect(calc(-3n, -1n, -11n)).toBe(-4n);
    expect(calc(-3n, -2n, 11n)).toBe(5n);
    expect(() => calc(6n, -1n, 9n)).toThrow("inverse does not exist");
    expect(() => calc(UINT256_MAX, -1n, -11n)).toThrow("overflow");
    expect(() => calc(1n << 256n, -1n, 11n)).toThrow("overflow");
    expect(() => evaluateCheckedExpression([Num(3n), "^", Num(-1n)])).toThrow();
    expect(() =>
      evaluateCheckedExpression([
        Num(2n),
        "^",
        Num(256n),
        "*",
        Num(1n),
        "%",
        Num(7n),
      ]),
    ).toThrow("overflow");
  });
});
