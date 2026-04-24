import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@flat",
  {
    module: "lang",
    cases: [
      {
        name: "should flatten one level of nested arrays",
        input: `@flat([[1 2] [3 4]])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(4);
          expect(result.map((n: Num) => n.toNumber())).to.deep.equal([
            1, 2, 3, 4,
          ]);
        },
      },
      {
        name: "should keep non-array elements as-is",
        input: `@flat([1 [2 3] 4])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(4);
          expect(result.map((n: Num) => n.toNumber())).to.deep.equal([
            1, 2, 3, 4,
          ]);
        },
      },
      {
        name: "should return empty array for empty input",
        input: `@flat([])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    docCases: [
      {
        description: "Flatten nested arrays",
        code: `set $nested [[1 2] [3 4] [5]]\nset $result @flat($nested)`,
      },
    ],
    sampleArgs: [`[1]`],
  },
  helpers.flat.argDefs,
);
