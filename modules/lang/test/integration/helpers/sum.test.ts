import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@sum",
  {
    module: "lang [@sum]",
    cases: [
      {
        name: "should sum the elements of an array",
        input: `@sum([1 2 3 4 5])`,
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(15n))).to.be.true;
        },
      },
      {
        name: "should return 0 for an empty array",
        input: `@sum([])`,
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(0n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Sum an array",
        code: `load lang [@sum]\nset $nums [1 2 3 4]\nset $total @sum($nums)`,
        preamble: "",
      },
    ],
    skipArgLengthCheck: true,
  },
  helpers.sum.argDefs,
);
