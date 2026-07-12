import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@len",
  {
    module: "lang [@len]",
    cases: [
      {
        name: "should return the length of an array",
        input: `@len([1 2 3])`,
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(3n))).to.be.true;
        },
      },
      {
        name: "should return 0 for an empty array",
        input: `@len([])`,
        validate(result) {
          expect(result.eq(Num(0n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Get array length",
        code: `load lang [@len]\nset $arr [10 20 30]\nprint @len($arr)`,
        preamble: "",
      },
    ],
    sampleArgs: [`[1]`],
  },
  helpers.len.argDefs,
);
