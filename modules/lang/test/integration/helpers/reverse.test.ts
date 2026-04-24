import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@reverse",
  {
    module: "lang",
    cases: [
      {
        name: "should reverse a numeric array",
        input: `@reverse([1 2 3])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(3);
          expect(result.map((n: Num) => n.toNumber())).to.deep.equal([3, 2, 1]);
        },
      },
      {
        name: "should reverse a string array",
        input: `@reverse(["a" "b" "c"])`,
        validate(result) {
          expect(result).to.deep.equal(["c", "b", "a"]);
        },
      },
      {
        name: "should return empty array for empty input",
        input: `@reverse([])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    docCases: [
      {
        description: "Reverse an array",
        code: `set $arr [1 2 3]\nset $rev @reverse($arr)`,
      },
    ],
    sampleArgs: [`[1]`],
  },
  helpers.reverse.argDefs,
);
