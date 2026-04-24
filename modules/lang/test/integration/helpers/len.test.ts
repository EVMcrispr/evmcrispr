import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@len",
  {
    module: "lang",
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
        code: `set $arr [10 20 30]\nprint @len($arr)`,
      },
    ],
    sampleArgs: [`[1]`],
  },
  helpers.len.argDefs,
);
