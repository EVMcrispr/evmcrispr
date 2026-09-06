import { describe, expect, it } from "bun:test";
import {
  decodeAbiParameters,
  decodeFunctionData,
  toFunctionSelector,
} from "viem";
import {
  checkedBinary,
  checkedMulDiv,
  evaluateCheckedExpression,
  INT256_MAX,
  INT256_MIN,
  markSignedInteger,
  Num,
  roundExactInteger,
  UINT256_MAX,
} from "../../src";
import {
  type CompileCtx,
  compileCheckedExpr,
  type Operand,
  operandNode,
  rawParam,
  toWord,
} from "../../src/onchain";
import { CORE_ABI } from "../../src/onchain/core";
import { type Node, NodeType } from "../../src/types";

const n = (value: bigint) => Num(value);
const integer = (value: bigint, signed = value < 0n) => ({ value, signed });
const calc = (tokens: unknown[]) =>
  evaluateCheckedExpression(tokens).toBigInt();

describe("checked arithmetic", () => {
  it("checks each intermediate, while exact evaluation only checks its rounded output", () => {
    expect(() => calc([n(UINT256_MAX), "*", n(2n), "//", n(2n)])).toThrow(
      "overflow",
    );
    expect(
      roundExactInteger(
        n(UINT256_MAX).mul(n(2n)).div(n(2n)),
        "trunc",
      ).toBigInt(),
    ).toBe(UINT256_MAX);
    expect(() => roundExactInteger(n(UINT256_MAX + 1n), "trunc")).toThrow(
      "overflow",
    );
  });
  it("distinguishes truncation, floor and ceiling for both quotient signs", () => {
    for (const [a, d] of [
      [7n, 3n],
      [-7n, 3n],
      [7n, -3n],
      [-7n, -3n],
    ]) {
      const rational = n(a).div(n(d));
      for (const mode of ["trunc", "floor", "ceil"] as const) {
        expect(
          checkedMulDiv(integer(a), integer(1n), integer(d), mode).value,
        ).toBe(
          mode === "floor"
            ? rational.floorBigInt()
            : mode === "ceil"
              ? rational.ceilBigInt()
              : rational.toBigInt(),
        );
      }
    }
  });
  it("supports full-width rounded multiplication without rescuing ordinary multiplication", () => {
    expect(
      evaluateCheckedExpression(
        [n(UINT256_MAX), "*", n(2n), "/", n(2n)],
        "ceil",
      ).toBigInt(),
    ).toBe(UINT256_MAX);
    expect(() => calc([n(1n), "/", n(2n)])).toThrow("only accepts //");
    expect(() =>
      evaluateCheckedExpression([n(1n), "//", n(2n)], "floor"),
    ).toThrow("//");
    expect(() =>
      evaluateCheckedExpression([n(1n), "/", n(2n), "+", n(1n)], "floor"),
    ).toThrow("root");
  });
  it("rejects fractional or coercible operands", () => {
    for (const value of [Num("0.5"), true, "3"])
      expect(() => calc([value, "+", n(1n)])).toThrow();
  });
  it("preserves positive signed provenance and checks mixed promotion", () => {
    expect(() => calc([markSignedInteger(n(INT256_MAX)), "+", n(1n)])).toThrow(
      "overflow",
    );
    expect(() => calc([n(-1n), "+", n(UINT256_MAX)])).toThrow("overflow");
    expect(() => calc([n(0n), "-", n(1n)])).toThrow("overflow");
  });
  it("implements XOR as 256-bit two's complement and preserves precedence", () => {
    expect(calc([n(2n), "+", n(4n), "xor", n(3n)])).toBe(5n);
    expect(calc([n(-1n), "xor", n(3n)])).toBe(-4n);
  });
  it("bounds exponentiation without allocating a huge bigint", () => {
    expect(() => calc([n(2n), "^", n(UINT256_MAX)])).toThrow("overflow");
    expect(calc([n(1n), "^", n(UINT256_MAX)])).toBe(1n);
    expect(calc([n(-2n), "^", n(255n)])).toBe(INT256_MIN);
    expect(() => calc([n(2n), "^", n(-1n)])).toThrow();
    expect(checkedBinary("%", integer(INT256_MIN), integer(-1n)).value).toBe(
      0n,
    );
    expect(() =>
      checkedBinary("//", integer(INT256_MIN), integer(-1n)),
    ).toThrow("overflow");
  });
});

const ctx = {
  core: "0x0000000000000000000000000000000000000001",
  operators: "0x0000000000000000000000000000000000000002",
} as unknown as CompileCtx;
const node = (value: bigint): Node =>
  operandNode({
    kind: "const",
    cat: value < 0n ? "Int" : "Uint",
    value: n(value),
  });
const op = (value: string): Node =>
  ({ type: NodeType.Bareword, value }) as Node;
describe("checked compilation", () => {
  it("uses matching checked constant folding and rounding", async () => {
    await expect(
      compileCheckedExpr(ctx, [node(UINT256_MAX), op("*"), node(2n)]),
    ).rejects.toThrow("overflow");
    const out = await compileCheckedExpr(
      ctx,
      [node(-7n), op("/"), node(3n)],
      "floor",
    );
    expect(out.kind === "const" && (out.value as Num).toBigInt()).toBe(-3n);
  });
  it("rejects scaled operands and ordinary slash", async () => {
    const live: Operand = {
      kind: "call",
      cat: "Uint",
      scale: 18,
      param: rawParam(toWord(1n)),
    };
    await expect(compileCheckedExpr(ctx, [operandNode(live)])).rejects.toThrow(
      "unscaled",
    );
    await expect(
      compileCheckedExpr(ctx, [node(1n), op("/"), node(2n)]),
    ).rejects.toThrow("only accepts //");
  });
});

describe("modular fusion", () => {
  for (const operation of ["+", "*"]) {
    const tokens = [n(UINT256_MAX), operation, n(2n)];
    it(`folds and compiles full-width ${operation} followed by remainder`, async () => {
      const expression = ["(", ...tokens, ")", "%", n(7n)];
      const expected =
        (operation === "+" ? UINT256_MAX + 2n : UINT256_MAX * 2n) % 7n;
      expect(calc(expression)).toBe(expected);
      const nodes = [
        op("("),
        node(UINT256_MAX),
        op(operation),
        node(2n),
        op(")"),
        op("%"),
        node(7n),
      ];
      const folded = await compileCheckedExpr(ctx, nodes);
      expect(folded.kind === "const" && (folded.value as Num).toBigInt()).toBe(
        expected,
      );
      nodes[1] = operandNode({
        kind: "call",
        cat: "Uint",
        param: rawParam(toWord(UINT256_MAX)),
      });
      const out = await compileCheckedExpr(ctx, nodes);
      if (out.kind !== "call") throw new Error("Expected call");
      const [target, data] = decodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        out.param.paramData,
      );
      expect(target).toBe(ctx.core);
      const decoded = decodeFunctionData({ abi: CORE_ABI, data });
      expect(decoded.functionName).toBe("read");
      if (decoded.functionName !== "read") throw new Error("Expected read");
      expect(decoded.args[1]).toBe(
        toFunctionSelector(
          `${operation === "+" ? "addMod" : "mulMod"}(uint256,uint256,uint256)`,
        ),
      );
      expect(decoded.args[2].map((p) => p.paramData)).toEqual([
        toWord(UINT256_MAX),
        toWord(2n),
        toWord(7n),
      ]);
    });
    it(`does not rescue mixed promotion or earlier ${operation} overflow`, () => {
      expect(() =>
        calc(["(", ...tokens, ")", "%", markSignedInteger(n(7n))]),
      ).toThrow("overflow");
      expect(() =>
        calc(["(", ...tokens, operation, n(1n), ")", "%", n(7n)]),
      ).toThrow("overflow");
      expect(() => calc(["(", ...tokens, ")", "%", n(0n)])).toThrow("zero");
    });
  }
  it("preserves sum precedence", () => {
    expect(calc([n(8n), "+", n(5n), "%", n(3n)])).toBe(10n);
  });
});

describe("signed modular fusion", () => {
  for (const operation of ["+", "*"]) {
    it(`folds and emits the signed ${operation} selector`, async () => {
      const expected =
        (operation === "+"
          ? INT256_MIN + INT256_MIN
          : INT256_MIN * INT256_MIN) % -7n;
      expect(
        calc(["(", n(INT256_MIN), operation, n(INT256_MIN), ")", "%", n(-7n)]),
      ).toBe(expected);
      const nodes = [
        op("("),
        node(INT256_MIN),
        op(operation),
        node(INT256_MIN),
        op(")"),
        op("%"),
        node(-7n),
      ];
      const folded = await compileCheckedExpr(ctx, nodes);
      expect(folded.cat).toBe("Int");
      expect(folded.kind === "const" && (folded.value as Num).toBigInt()).toBe(
        expected,
      );
      nodes[1] = operandNode({
        kind: "call",
        cat: "Int",
        param: rawParam(toWord(INT256_MIN)),
      });
      const out = await compileCheckedExpr(ctx, nodes);
      expect(out.cat).toBe("Int");
      if (out.kind !== "call") throw new Error("Expected call");
      const [, data] = decodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        out.param.paramData,
      );
      const decoded = decodeFunctionData({ abi: CORE_ABI, data });
      if (decoded.functionName !== "read") throw new Error("Expected read");
      expect(decoded.args[1]).toBe(
        toFunctionSelector(
          `${operation === "+" ? "addMod" : "mulMod"}(int256,int256,int256)`,
        ),
      );
      expect(decoded.args[2].map((p) => p.paramData)).toEqual([
        toWord(INT256_MIN),
        toWord(INT256_MIN),
        toWord(-7n),
      ]);
      expect(() =>
        calc(["(", n(INT256_MIN), operation, n(2n), ")", "%", n(0n)]),
      ).toThrow("zero");
      expect(() =>
        calc([
          "(",
          n(INT256_MIN),
          "*",
          n(2n),
          operation,
          n(1n),
          ")",
          "%",
          n(7n),
        ]),
      ).toThrow("overflow");
    });
  }
});
