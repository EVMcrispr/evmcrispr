import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

/* The plain run faces: pure JS math over numbers, mirroring the on-chain
 * `!` faces so every helper is composable off-chain and on-chain. */

describeHelper("@math:min", {
  module: "math",
  cases: [
    {
      name: "should pick the smallest of many operands",
      input: "@math:min(3 1 2)",
      validate: (result) => {
        expect(String(result)).to.equal("1");
      },
    },
    {
      name: "should keep scientific-notation precision",
      input: "@math:min(2e18 1e18)",
      validate: (result) => {
        expect(String(result)).to.equal("1000000000000000000");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a single operand",
      input: "@math:min(1)",
      error: "at least two operands",
    },
  ],
  docCases: [
    {
      description: "The smaller of two amounts",
      code: "set $floor @math:min(100e18 250e18)",
    },
  ],
  sampleArgs: ["1", "2"],
});

describeHelper("@math:max", {
  module: "math",
  cases: [
    {
      name: "should pick the largest of many operands",
      input: "@math:max(3 1 2)",
      validate: (result) => {
        expect(String(result)).to.equal("3");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a single operand",
      input: "@math:max(1)",
      error: "at least two operands",
    },
  ],
  docCases: [
    {
      description: "The larger of two amounts",
      code: "set $ceiling @math:max(100e18 250e18)",
    },
  ],
  sampleArgs: ["1", "2"],
});

describeHelper(
  "@math:absdiff",
  {
    module: "math",
    cases: [
      {
        name: "should never underflow",
        input: "@math:absdiff(3 10)",
        validate: (result) => {
          expect(String(result)).to.equal("7");
        },
      },
      {
        name: "should be symmetric",
        input: "@math:absdiff(10 3)",
        validate: (result) => {
          expect(String(result)).to.equal("7");
        },
      },
    ],
    docCases: [
      {
        description: "Distance between two amounts",
        code: "set $drift @math:absdiff(100e18 99e18)",
      },
    ],
    sampleArgs: ["3", "10"],
  },
  helpers.absdiff.argDefs,
);

describeHelper("@math:sqrt", {
  module: "math",
  cases: [
    {
      name: "should take the floor integer square root",
      input: "@math:sqrt(17)",
      validate: (result) => {
        expect(String(result)).to.equal("4");
      },
    },
    {
      name: "should handle perfect squares of large numbers",
      input: "@math:sqrt(1e18)",
      validate: (result) => {
        expect(String(result)).to.equal("1000000000");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a negative operand",
      input: "@math:sqrt(-4)",
      error: "unsigned operand",
    },
  ],
  docCases: [
    {
      description: "Floor integer square root",
      code: "set $side @math:sqrt(1e18)",
    },
  ],
  sampleArgs: ["17"],
});
