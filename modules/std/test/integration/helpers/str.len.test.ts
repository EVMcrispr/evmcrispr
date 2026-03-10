import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.len", {
  cases: [
    {
      name: "should return the length of a string",
      input: `@str.len("hello")`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(Num(5n))).to.be.true;
      },
    },
    {
      name: "should return 0 for an empty string",
      input: `@str.len("")`,
      validate(result) {
        expect(result.eq(Num(0n))).to.be.true;
      },
    },
  ],
  sampleArgs: [`"a"`],
}, helpers["str.len"].argDefs);
