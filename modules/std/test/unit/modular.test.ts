import { describe, expect, it } from "bun:test";
import { Num, UINT256_MAX } from "@evmcrispr/sdk";
import { evaluateArithmeticExpr } from "../../src/helpers/_expr";

const evaluate = (tokens: unknown[]) => evaluateArithmeticExpr(tokens);
describe("num modular powers", () => {
  it("evaluates inverses only when a power is immediately followed by remainder", () => {
    expect(evaluate([Num(3n), "^", Num(-1n), "%", Num(11n)]).num).toBe(4n);
    expect(
      evaluate(["(", Num(-3n), "^", Num(-2n), ")", "%", Num(-11n)]).num,
    ).toBe(5n);
    expect(evaluate([Num(3n), "^", Num(-1n)]).eq(Num(1n).div(Num(3n)))).toBe(
      true,
    );
    expect(evaluate([Num(3n), "^", Num(-1n), "*", Num(3n)]).num).toBe(1n);
    expect(() =>
      evaluate([Num(3n), "^", Num(-1n), "*", Num(1n), "%", Num(11n)]),
    ).toThrow("integer");
    expect(() => evaluate([Num(6n), "^", Num(-1n), "%", Num(9n)])).toThrow(
      "inverse does not exist",
    );
  });
  it("keeps rational arithmetic, coercion and precedence", () => {
    expect(evaluate([Num("0.5"), "^", Num(-1n), "%", Num(3n)]).num).toBe(2n);
    expect(evaluate(["3", "^", Num(-1n), "%", "11"]).num).toBe(4n);
    expect(
      evaluate([Num(1n), "+", Num(3n), "^", "-", Num(1n), "%", Num(11n)]).num,
    ).toBe(5n);
    expect(
      evaluate([Num(2n), "^", Num(3n), "^", Num(2n), "%", Num(7n)]).num,
    ).toBe(1n);
    expect(() => evaluate([Num(3n), "^", Num("0.5"), "%", Num(11n)])).toThrow(
      "integer",
    );
    expect(() => evaluate([Num(3n), "^", Num(-1n), "%", Num(0n)])).toThrow(
      "zero",
    );
  });
  it("allows arbitrary-precision inputs and avoids huge power intermediates", () => {
    expect(evaluate([Num(2n), "^", Num(UINT256_MAX), "%", Num(7n)]).num).toBe(
      1n,
    );
    const m = 1n << 300n;
    expect(evaluate([Num(m + 1n), "^", Num(-1n), "%", Num(m)]).num).toBe(1n);
  });
});
