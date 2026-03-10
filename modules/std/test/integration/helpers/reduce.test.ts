import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@reduce", {
  preamble: `
def @add "$a: any $b: any -> number" @num($a + $b)
def @cat "$a: string $b: string -> string" @str.concat($a $b)
`,
  cases: [
    {
      name: "should sum numbers with an add helper",
      input: `@reduce([1 2 3 4 5] @add 0)`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(Num(15n))).to.be.true;
      },
    },
    {
      name: "should return initial value for empty array",
      input: `@reduce([] @add 42)`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(Num(42n))).to.be.true;
      },
    },
    {
      name: "should concatenate strings",
      input: `@reduce(["hello" " " "world"] @cat "")`,
      expected: "hello world",
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@reduce([1 2] "notAHelper" 0)`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.reduce.argDefs);
