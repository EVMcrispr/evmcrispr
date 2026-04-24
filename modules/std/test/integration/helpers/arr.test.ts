import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@arr",
  {
    cases: [
      {
        name: "should generate a range of numbers (end exclusive)",
        input: `@arr(0 5)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(5);
          expect(result[0]).to.be.instanceOf(Num);
          expect(result[0].eq(Num(0n))).to.be.true;
          expect(result[4].eq(Num(4n))).to.be.true;
        },
      },
      {
        name: "should return empty array when start equals end",
        input: `@arr(3 3)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
      {
        name: "should support non-zero start",
        input: `@arr(5 8)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(3);
          expect(result[0].eq(Num(5n))).to.be.true;
          expect(result[2].eq(Num(7n))).to.be.true;
        },
      },
    ],
    docCases: [
      { description: "Generate [0, 1, 2, 3, 4]", code: `set $nums @arr(0 5)` },
      { description: "Generate [3, 4, 5, 6]", code: `set $nums @arr(3 7)` },
    ],
    errorCases: [
      {
        name: "should fail when range exceeds maximum length",
        input: `@arr(0 10001)`,
        error: "maximum length",
      },
    ],
  },
  helpers.arr.argDefs,
);
