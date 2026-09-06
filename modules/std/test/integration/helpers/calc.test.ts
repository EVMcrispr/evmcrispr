import "../../setup";
import type { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

for (const [helper, cases] of [
  [
    "calc",
    [
      ["1 // 2 * 2", 0n],
      ["6 xor 3", 5n],
      ["-7 // 3", -2n],
      ["-7 % 3", -1n],
    ],
  ],
  [
    "calcFloor",
    [
      ["-7 / 3", -3n],
      ["7 * 3 / 2", 10n],
    ],
  ],
  [
    "calcCeil",
    [
      ["7 * 3 / 2", 11n],
      ["-7 / 3", -2n],
    ],
  ],
  [
    "num",
    [
      ["1 / 2 * 2", 1n],
      ["-7 / 3", -2n],
      ["2 * 0.04 * 100", 8n],
    ],
  ],
  [
    "floor",
    [
      ["-7 / 3", -3n],
      ["1 / 22 * 21", 0n],
    ],
  ],
  [
    "ceil",
    [
      ["1 / 22 * 21", 1n],
      ["-7 / 3", -2n],
    ],
  ],
] as const) {
  describeHelper(`@${helper}`, {
    skipArgLengthCheck: true,
    cases: cases.map(([expression, expected]) => ({
      name: expression,
      input: `@${helper}(${expression})`,
      validate(result: Num) {
        expect(result.toBigInt()).to.equal(expected);
      },
    })),
  });
}
