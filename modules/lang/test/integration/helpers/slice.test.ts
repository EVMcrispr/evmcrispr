import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@slice",
  {
    module: "lang [@slice]",
    cases: [
      {
        name: "should slice an array with start and end",
        input: `@slice([10 20 30 40] 1 3)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
          expect(result[0].eq(Num(20n))).to.be.true;
          expect(result[1].eq(Num(30n))).to.be.true;
        },
      },
      {
        name: "should slice an array from start",
        input: `@slice([10 20 30] 1)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
        },
      },
      {
        name: "should support negative indices on arrays",
        input: `@slice([10 20 30] -2)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
          expect(result[0].eq(Num(20n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Slice middle portion",
        code: `load lang [@slice]\nset $arr [10 20 30 40 50]\nset $mid @slice($arr 1 3)`,
        preamble: "",
      },
      {
        description: "Slice from offset to end",
        code: `load lang [@slice]\nset $arr [10 20 30 40 50]\nset $tail @slice($arr 2)`,
        preamble: "",
      },
      {
        description: "Negative index slice",
        code: `load lang [@slice]\nset $arr [10 20 30 40 50]\nset $last2 @slice($arr -2)`,
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "rejects fractional slice bounds",
        input: `@slice([1 2] 0 1.5)`,
        error: "Checked arithmetic",
      },
      {
        name: "rejects slice bounds outside int256",
        input: `@slice([1 2] ${1n << 255n})`,
        error: "int256",
      },
    ],
    sampleArgs: [`[1]`, `0`, `1`],
  },
  helpers.slice.argDefs,
);
