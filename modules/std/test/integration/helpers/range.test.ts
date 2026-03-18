import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@range", {
  cases: [
    {
      name: "should generate a range of numbers",
      input: `@range(0 5)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(5);
        expect(result[0]).to.be.instanceOf(Num);
        expect(result[0].eq(Num(0n))).to.be.true;
        expect(result[4].eq(Num(4n))).to.be.true;
      },
    },
    {
      name: "should return empty array when start equals end",
      input: `@range(3 3)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
    {
      name: "should support non-zero start",
      input: `@range(5 8)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
        expect(result[0].eq(Num(5n))).to.be.true;
        expect(result[2].eq(Num(7n))).to.be.true;
      },
    },
  ],
  docCases: [
    { description: "Generate a range", code: `set $nums @range(0 5)` },
    { description: "Range with offset start", code: `set $nums @range(3 7)` },
  ],
  errorCases: [
    {
      name: "should fail when range exceeds maximum length",
      input: `@range(0 10001)`,
      error: "maximum length",
    },
  ],
}, helpers.range.argDefs);
