import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@enumerate",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Enumerate array elements",
        code: `set $items ["a" "b" "c"]\nset $pairs @enumerate($items)`,
      },
    ],
    sampleArgs: [`[1]`],
  },
  helpers.enumerate.argDefs,
);
