import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@unique", {
  cases: [
    {
      name: "should remove duplicate numbers",
      input: `@unique([1 2 2 3 1])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
        expect(result.map((n: Num) => Number(n.toBigInt()))).to.deep.equal([1, 2, 3]);
      },
    },
    {
      name: "should remove duplicate strings",
      input: `@unique(["a" "b" "a" "c"])`,
      validate(result) {
        expect(result).to.deep.equal(["a", "b", "c"]);
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@unique([])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
  ],
  sampleArgs: [`[1]`],
}, helpers.unique.argDefs);
