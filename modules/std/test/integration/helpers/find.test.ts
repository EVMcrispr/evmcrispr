import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@find", {
  preamble: `
def @isThree "$x: number -> bool" @bool($x == 3)
def @isTrue "$x: any -> bool" @bool($x)
def @isNeg "$x: number -> bool" @bool($x < 0)
`,
  cases: [
    {
      name: "should return the first matching element",
      input: `@find([1 2 3 4] @isThree)`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(new Num(3n))).to.be.true;
      },
    },
    {
      name: "should return the first match even if multiple exist",
      input: `@find([false true true] @isTrue)`,
      validate(result) {
        expect(result).to.equal(true);
      },
    },
  ],
  errorCases: [
    {
      name: "should throw when no element matches",
      input: `@find([1 2 3] @isNeg)`,
      error: "no element matched",
    },
    {
      name: "should fail when second argument is not a helper",
      input: `@find([1 2] "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.find.argDefs);
