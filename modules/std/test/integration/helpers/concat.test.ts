import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@concat", {
  cases: [
    {
      name: "should concatenate two arrays",
      input: `@concat([1 2] [3 4])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(4);
        expect(result[0]).to.be.instanceOf(Num);
        expect(result[3]).to.be.instanceOf(Num);
      },
    },
    {
      name: "should concatenate multiple arrays",
      input: `@concat([1] [2] [3])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
      },
    },
    {
      name: "should return a single array unchanged",
      input: `@concat([1 2])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(2);
      },
    },
    {
      name: "should concatenate nested arrays",
      input: `@concat(["a" 3] ["c" ["d"]])`,
      validate(result) {
        expect(result).to.deep.equal(["a", Num(3n), "c", ["d"]]);
      },
    },
  ],
  docCases: [
    { description: "Concatenate two arrays", code: `set $a [1 2]\nset $b [3 4]\nset $merged @concat($a $b)` },
    { description: "Concatenate three arrays", code: `set $triple @concat([1 2] [3 4] [5 6])` },
  ],
  sampleArgs: [`[1]`],
}, helpers.concat.argDefs);
