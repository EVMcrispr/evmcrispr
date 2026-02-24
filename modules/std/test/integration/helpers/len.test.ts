import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@len", {
  cases: [
    {
      name: "should return the length of a string",
      input: `@len("hello")`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(new Num(5n))).to.be.true;
      },
    },
    {
      name: "should return 0 for an empty string",
      input: `@len("")`,
      validate(result) {
        expect(result.eq(new Num(0n))).to.be.true;
      },
    },
    {
      name: "should return the length of an array",
      input: `@len([1, 2, 3])`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(new Num(3n))).to.be.true;
      },
    },
    {
      name: "should return 0 for an empty array",
      input: `@len([])`,
      validate(result) {
        expect(result.eq(new Num(0n))).to.be.true;
      },
    },
  ],
  sampleArgs: [`"a"`],
}, helpers.len.argDefs);
