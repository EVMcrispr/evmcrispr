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
  "@math:absDiff",
  {
    module: "math",
    cases: [
      {
        name: "should never underflow",
        input: "@math:absDiff(3 10)",
        validate: (result) => {
          expect(String(result)).to.equal("7");
        },
      },
      {
        name: "should be symmetric",
        input: "@math:absDiff(10 3)",
        validate: (result) => {
          expect(String(result)).to.equal("7");
        },
      },
    ],
    docCases: [
      {
        description: "Distance between two amounts",
        code: "set $drift @math:absDiff(100e18 99e18)",
      },
    ],
    sampleArgs: ["3", "10"],
  },
  helpers.absDiff.argDefs,
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

describeHelper("@math:pow", {
  module: "math",
  cases: [
    {
      name: "should raise a wad value to a whole power",
      input: "@math:pow(15e17 2)",
      validate: (result) => {
        // 1.5^2 = 2.25 in wad
        expect(String(result)).to.equal("2250000000000000000");
      },
    },
    {
      name: "should take the unit from an explicit base",
      input: "@math:pow(15e26 2 1e27)",
      validate: (result) => {
        expect(String(result)).to.equal("2250000000000000000000000000");
      },
    },
    {
      name: "should compound a per-second rate over a year",
      input: "@math:pow(1000000001585489599188229325 31536000 1e27)",
      validate: (result) => {
        // (1 + 0.05/SPY)^SPY, which lands on e^0.05 = 1.05127109…
        expect(String(result).slice(0, 11)).to.equal("10512710963");
      },
    },
    {
      name: "should return one unit for a zero exponent",
      input: "@math:pow(5e18 0)",
      validate: (result) => {
        expect(String(result)).to.equal("1000000000000000000");
      },
    },
  ],
  docCases: [
    {
      description: "Compound a 5% per-year rate over three years",
      code: "set $growth @math:pow(105e16 3)",
    },
  ],
  sampleArgs: ["15e17", "2"],
});

describeHelper("@math:exp", {
  module: "math",
  cases: [
    {
      name: "should agree with the on-chain wad exponential",
      input: "@math:exp(1e18)",
      validate: (result) => {
        expect(String(result)).to.equal("2718281828459045235");
      },
    },
    {
      name: "should handle a negative exponent",
      input: "@math:exp(-1e18)",
      validate: (result) => {
        expect(String(result)).to.equal("367879441171442321");
      },
    },
  ],
  docCases: [
    {
      description: "Continuous growth at 5% over one period",
      code: "set $factor @math:exp(5e16)",
    },
  ],
  sampleArgs: ["1e18"],
});

describeHelper("@math:ln", {
  module: "math",
  cases: [
    {
      name: "should be zero at one",
      input: "@math:ln(1e18)",
      validate: (result) => {
        expect(String(result)).to.equal("0");
      },
    },
    {
      name: "should invert exp",
      input: "@math:ln(2718281828459045235)",
      validate: (result) => {
        expect(String(result).slice(0, 4)).to.equal("9999");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject zero",
      input: "@math:ln(0)",
      error: "undefined at or below zero",
    },
  ],
  docCases: [
    {
      description: "Turn a growth factor back into its rate",
      code: "set $rate @math:ln(105e16)",
    },
  ],
  sampleArgs: ["2718281828459045235"],
});

describeHelper("@math:log2", {
  module: "math",
  cases: [
    {
      name: "should floor the base-2 logarithm",
      input: "@math:log2(255)",
      validate: (result) => {
        expect(String(result)).to.equal("7");
      },
    },
    {
      name: "should give the bit position of a power of two",
      input: "@math:log2(256)",
      validate: (result) => {
        expect(String(result)).to.equal("8");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject zero",
      input: "@math:log2(0)",
      error: "undefined at zero",
    },
  ],
  docCases: [
    {
      description: "Bit length of a value, minus one",
      code: "set $bits @math:log2(1e18)",
    },
  ],
  sampleArgs: ["255"],
});
