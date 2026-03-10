import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@enumerate", {
  cases: [
    {
      name: "should return index-element pairs",
      input: `@enumerate(["a" "b" "c"])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
        expect(result[0]).to.be.an("array").with.lengthOf(2);
        expect(result[0][0]).to.be.instanceOf(Num);
        expect(result[0][0].toNumber()).to.equal(0);
        expect(result[0][1]).to.equal("a");
        expect(result[2][0].toNumber()).to.equal(2);
        expect(result[2][1]).to.equal("c");
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@enumerate([])`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
  ],
  sampleArgs: [`[1]`],
}, helpers.enumerate.argDefs);
