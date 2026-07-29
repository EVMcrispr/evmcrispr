import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@unzip",
  {
    module: "lang [@unzip @zip]",
    cases: [
      {
        name: "should transpose pairs into two arrays",
        input: `@unzip(@zip([1 2 3] ["a" "b" "c"]))`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
          expect(result[0]).to.be.an("array").with.lengthOf(3);
          expect(result[1]).to.be.an("array").with.lengthOf(3);
          expect(result[0][0]).to.be.instanceOf(Num);
          expect(result[1][0]).to.equal("a");
          expect(result[1][2]).to.equal("c");
        },
      },
      {
        name: "should return two empty arrays for empty input",
        input: `@unzip([])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
          expect(result[0]).to.be.an("array").with.lengthOf(0);
          expect(result[1]).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    docCases: [
      {
        description: "Unzip pairs into arrays",
        code: `load lang [@unzip]\nset $pairs [[1 "a"] [2 "b"] [3 "c"]]\nset [$keys $vals] @unzip($pairs)`,
        preamble: "",
      },
    ],
    sampleArgs: [`[[1 2]]`],
  },
  helpers.unzip.argDefs,
);
