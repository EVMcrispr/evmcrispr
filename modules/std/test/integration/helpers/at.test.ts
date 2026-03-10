import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@at", {
  cases: [
    {
      name: "should return element at index in array",
      input: `@at([10 20 30] 1)`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(Num(20n))).to.be.true;
      },
    },
    {
      name: "should return first element at index 0",
      input: `@at(["a" "b" "c"] 0)`,
      expected: "a",
    },
    {
      name: "should support negative indices in array",
      input: `@at([10 20 30] -1)`,
      validate(result) {
        expect(result.eq(Num(30n))).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on out-of-bounds index",
      input: `@at([1 2] 5)`,
      error: "out of bounds",
    },
    {
      name: "should fail on negative out-of-bounds",
      input: `@at([1] -3)`,
      error: "out of bounds",
    },
  ],
  sampleArgs: [`[1]`, `0`],
}, helpers.at.argDefs);
