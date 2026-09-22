import { describe, expect, it } from "bun:test";
import { decodeAbiParameters, decodeFunctionData } from "viem";
import { CORE_ABI } from "../../src/onchain/core";
import {
  type Constraint,
  constraint,
  type InputParam,
  inConstraint,
  PARAM_TYPE,
  rawParam,
  toWord,
} from "../../src/onchain/erc8211";
import { constrainWord } from "../../src/onchain/word-constraints";

const ctx = { core: "0x0000000000000000000000000000000000001001" } as const;
const max = (1n << 256n) - 1n;
function resolvedInput(param: InputParam): InputParam {
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  );
  expect(target).toBe(ctx.core);
  const decoded = decodeFunctionData({ abi: CORE_ABI, data });
  expect(decoded.functionName).toBe("resolve");
  return decoded.args[0] as InputParam;
}

describe("constraints on the same word", () => {
  const cases: [string, Constraint, Constraint, Constraint][] = [
    [
      "upper then lower",
      constraint("Lte", 100n),
      constraint("Gte", 1n),
      inConstraint(1n, 100n),
    ],
    [
      "lower then upper",
      constraint("Gte", 1n),
      constraint("Lte", 100n),
      inConstraint(1n, 100n),
    ],
    [
      "tighter lower",
      constraint("Gte", 1n),
      constraint("Gte", 10n),
      constraint("Gte", 10n),
    ],
    [
      "tighter upper",
      constraint("Lte", 100n),
      constraint("Lte", 80n),
      constraint("Lte", 80n),
    ],
    [
      "intersect ranges",
      inConstraint(1n, 100n),
      inConstraint(10n, 200n),
      inConstraint(10n, 100n),
    ],
    [
      "retain equality",
      constraint("Eq", 42n),
      constraint("Lte", 100n),
      constraint("Eq", 42n),
    ],
    [
      "new equality",
      inConstraint(1n, 100n),
      constraint("Eq", 42n),
      constraint("Eq", 42n),
    ],
    [
      "touching bounds",
      constraint("Gte", 42n),
      constraint("Lte", 42n),
      constraint("Eq", 42n),
    ],
    [
      "zero boundary",
      constraint("Eq", 0n),
      constraint("Lte", max),
      constraint("Eq", 0n),
    ],
    [
      "maximum boundary",
      constraint("Eq", max),
      constraint("Gte", 1n),
      constraint("Eq", max),
    ],
  ];
  for (const [label, first, next, expected] of cases) {
    it(`merges ${label} without an extra call`, () => {
      const input = rawParam(toWord(42n), [first]);
      const output = constrainWord(ctx, input, next);
      expect(output).toEqual({ ...input, constraints: [expected] });
      expect(input.constraints).toEqual([first]);
    });
  }

  it("adds the first constraint and preserves routing and later words", () => {
    const first = constraint("Lte", 100n);
    const second = constraint("Eq", 9n);
    const input = { ...rawParam(toWord(42n)), paramType: PARAM_TYPE.Value };
    expect(constrainWord(ctx, input, first)).toEqual({
      ...input,
      constraints: [first],
    });
    const pair = rawParam(`${toWord(42n)}${toWord(9n).slice(2)}`, [
      first,
      second,
    ]);
    expect(constrainWord(ctx, pair, constraint("Gte", 1n)).constraints).toEqual(
      [inConstraint(1n, 100n), second],
    );
  });

  for (const first of [
    constraint("Lte", 0n), // Contradicts the new lower bound.
    { constraintType: 4, referenceData: toWord(-10n) }, // Signed.
    { constraintType: 7, referenceData: "0x" }, // SKIP.
    { constraintType: 6, referenceData: "0x" }, // Malformed OR.
    { constraintType: 99, referenceData: toWord(1n) }, // Unknown kind.
    { constraintType: 2, referenceData: "0x01" }, // Noncanonical scalar.
    inConstraint(100n, 1n), // Reversed range must still fail at runtime.
    {
      ...inConstraint(1n, 100n),
      referenceData: `${inConstraint(1n, 100n).referenceData}00`,
    },
  ] as Constraint[]) {
    it(`preserves nonmergeable check ${first.constraintType}/${first.referenceData.length} inside resolve`, () => {
      const input = {
        ...rawParam(toWord(42n), [first]),
        paramType: PARAM_TYPE.Value,
      };
      const next = constraint("Gte", 1n);
      const output = constrainWord(ctx, input, next);
      expect(output.constraints).toEqual([next]);
      expect(output.paramType).toBe(PARAM_TYPE.Value);
      expect(resolvedInput(output)).toEqual(input);
    });
  }
});
