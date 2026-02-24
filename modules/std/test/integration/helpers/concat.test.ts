import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@concat", {
  cases: [
    {
      name: "should concatenate two strings",
      input: `@concat("hello", " world")`,
      expected: "hello world",
    },
    {
      name: "should concatenate multiple strings",
      input: `@concat("a", "b", "c")`,
      expected: "abc",
    },
    {
      name: "should return a single string unchanged",
      input: `@concat("solo")`,
      expected: "solo",
    },
    {
      name: "should concatenate two arrays",
      input: `@concat([1, 2], [3, 4])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(4);
        expect(result[0]).to.be.instanceOf(Num);
        expect(result[3]).to.be.instanceOf(Num);
      },
    },
    {
      name: "should concatenate multiple arrays",
      input: `@concat([1], [2], [3])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
      },
    },
    {
      name: "should return a single array unchanged",
      input: `@concat([1, 2])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(2);
      },
    },
    {
      name: "should concatenate nested arrays",
      input: `@concat(["a", 3], ["c", ["d"]])`,
      validate(result) {
        expect(result).to.deep.equal(["a", new Num(3n), "c", ["d"]]);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when mixing an array with a string",
      input: `@concat([1, 2], "x")`,
      error: "cannot mix",
    },
    {
      name: "should fail when mixing a string with an array",
      input: `@concat("x", [1, 2])`,
      error: "cannot mix",
    },
  ],
  sampleArgs: [`"a"`],
}, helpers.concat.argDefs);
