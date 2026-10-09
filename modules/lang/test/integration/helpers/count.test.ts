import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@count",
  {
    module: "lang [@count]",
    preamble: `def @isBig "$x: number -> bool" @bool($x > 2)`,
    cases: [
      {
        name: "should count the elements that match",
        input: `@count([1 2 3 4 5] @isBig)`,
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(3n))).to.be.true;
        },
      },
      {
        name: "should return 0 when no element matches",
        input: `@count([1 2] @isBig)`,
        validate(result) {
          expect(result.eq(Num(0n))).to.be.true;
        },
      },
      {
        name: "should return 0 for an empty array",
        input: `@count([] @isBig)`,
        validate(result) {
          expect(result.eq(Num(0n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Count the large elements",
        code: `load lang [@count]\ndef @isBig "$n: number -> bool" @bool($n > 2)\nprint @count([1 2 3 4] @isBig)`,
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "should fail when second argument is not a helper",
        input: `@count([1 2] "notAHelper")`,
        error: "must be a helper reference",
      },
    ],
    skipArgLengthCheck: true,
  },
  helpers.count.argDefs,
);
