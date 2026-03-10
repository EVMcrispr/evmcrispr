import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@sort", {
  preamble: `
def @cmpAsc "$a: number $b: number -> number" ($a - $b)
def @cmpDesc "$a: number $b: number -> number" ($b - $a)
`,
  cases: [
    {
      name: "should sort numbers ascending with a comparator",
      input: `@sort([3, 1, 2], @cmpAsc)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
        expect(result[0]).to.be.instanceOf(Num);
        expect(result.map((n: Num) => Number(n.toBigInt()))).to.deep.equal([1, 2, 3]);
      },
    },
    {
      name: "should sort numbers descending with a reversed comparator",
      input: `@sort([3, 1, 2], @cmpDesc)`,
      validate(result) {
        expect(result.map((n: Num) => Number(n.toBigInt()))).to.deep.equal([3, 2, 1]);
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@sort([], @cmpAsc)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
    {
      name: "should return single-element array unchanged",
      input: `@sort([42], @cmpAsc)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(1);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@sort([1, 2], "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.sort.argDefs);
