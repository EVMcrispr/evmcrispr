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

for (const helper of [
  "calc",
  "num",
  "calcFloor",
  "calcCeil",
  "floor",
  "ceil",
]) {
  describeHelper(`@${helper}`, {
    skipArgLengthCheck: true,
    cases: [
      ["3 ^ -1 % 11", 4n],
      ["(3 ^ -2) % 11", 5n],
      ["-3 ^ -1 % -11", -4n],
      ["3 ^ -1 % 10", 7n],
      ["0 ^ -1 % 1", 0n],
      ["2 ^ 1000000 % 7", 2n],
    ].map(([expression, expected]) => ({
      name: `modular power ${expression}`,
      input: `@${helper}(${expression})`,
      validate(result: Num) {
        expect(result.toBigInt()).to.equal(expected);
      },
    })),
  });
}
