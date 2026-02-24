import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@slice", {
  cases: [
    {
      name: "should slice a string with start and end",
      input: `@slice("hello world", 0, 5)`,
      expected: "hello",
    },
    {
      name: "should slice a string from start to end",
      input: `@slice("hello", 2)`,
      expected: "llo",
    },
    {
      name: "should support negative indices on strings",
      input: `@slice("hello", -3)`,
      expected: "llo",
    },
    {
      name: "should slice an array with start and end",
      input: `@slice([10, 20, 30, 40], 1, 3)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(2);
        expect(result[0].eq(new Num(20n))).to.be.true;
        expect(result[1].eq(new Num(30n))).to.be.true;
      },
    },
    {
      name: "should slice an array from start",
      input: `@slice([10, 20, 30], 1)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(2);
      },
    },
    {
      name: "should support negative indices on arrays",
      input: `@slice([10, 20, 30], -2)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(2);
        expect(result[0].eq(new Num(20n))).to.be.true;
      },
    },
  ],
  sampleArgs: [`"a"`, `0`, `1`],
}, helpers.slice.argDefs);
