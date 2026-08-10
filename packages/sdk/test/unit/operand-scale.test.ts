import { describe, expect, it } from "bun:test";

import { Num } from "../../src";
import type { CompileCtx, Operand } from "../../src/onchain";
import {
  arithCombine,
  cmpCombine,
  rawParam,
  scaleOf,
  toWord,
} from "../../src/onchain";

const CORE = "0x00000000000000000000000000000000000a55e7" as const;
const OPERATORS = "0x000000000000000000000000000000000097e7a7" as const;

// The scale rules are pure operand algebra: they never consult the module
// or the interpreters, so a ctx with just the two addresses is enough.
const ctx = {
  core: CORE,
  operators: OPERATORS,
} as unknown as CompileCtx;

/** A live read carrying `scale` decimal places — what an Aave ray rate
 *  (27) or a Comet wad rate (18) compiles to. */
const live = (scale?: number): Operand => ({
  kind: "call",
  param: rawParam(toWord(1n)),
  cat: "Uint",
  ...(scale === undefined ? {} : { scale }),
});

const constant = (v: string, scale?: number): Operand => ({
  kind: "const",
  cat: "Uint",
  value: Num(v),
  ...(scale === undefined ? {} : { scale }),
});

describe("operand scale", () => {
  it("treats a missing scale as a plain integer", () => {
    expect(scaleOf(live())).toBe(0);
    expect(scaleOf(live(27))).toBe(27);
  });

  it("absorbs the alignment factor into a constant, exactly", () => {
    // The point of the whole mechanism: 0.05 against a ray read is the
    // WHOLE number 5e25, so nothing has to be rounded.
    const out = cmpCombine(ctx, "Gt", live(27), constant("0.05"));
    expect(out.kind).toBe("call");
    expect(out.cat).toBe("Bool");
  });

  it("keeps a fraction exact when the scale absorbs its denominator", () => {
    // 0.05 = 1/20, and 20 divides 10^27.
    const scaled = Num("0.05").mul(Num(10n ** 27n));
    expect(scaled.isInteger()).toBe(true);
    expect(scaled.toBigInt()).toBe(5n * 10n ** 25n);
  });

  it("adds scales when multiplying and subtracts them when dividing", () => {
    expect(scaleOf(arithCombine(ctx, "Mul", live(18), live(9)))).toBe(27);
    expect(scaleOf(arithCombine(ctx, "Div", live(27), live(9)))).toBe(18);
  });

  it("carries the common scale through the additive family", () => {
    for (const op of ["Add", "Sub", "Min", "Max"] as const) {
      expect(scaleOf(arithCombine(ctx, op, live(27), live(18)))).toBe(27);
    }
  });

  it("refuses a division that would leave a fraction", () => {
    // scale 9 / scale 27 is 10^-18: representable only as a fraction.
    expect(() => arithCombine(ctx, "Div", live(9), live(27))).toThrow(
      /leaves a fraction/,
    );
  });

  it("refuses to exponentiate a scaled value", () => {
    // An exponent counts repetitions: scaling it would turn ^2 into
    // ^2e18, and x^n over a scaled x needs a fixed-point pow.
    expect(() => arithCombine(ctx, "Exp", live(18), constant("2"))).toThrow(
      /plain integer operands/,
    );
    expect(() => arithCombine(ctx, "Exp", live(), constant("2", 18))).toThrow(
      /plain integer operands/,
    );
  });

  it("leaves unscaled arithmetic alone", () => {
    const out = arithCombine(ctx, "Add", live(), live());
    expect(out.scale).toBeUndefined();
    expect(scaleOf(out)).toBe(0);
  });

  it("folds two scaled constants without losing the scale", () => {
    const out = arithCombine(ctx, "Add", constant("2", 18), constant("3", 18));
    expect(out.kind).toBe("const");
    expect(scaleOf(out)).toBe(18);
  });
});
