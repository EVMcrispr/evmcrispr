import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@zip",
  {
    module: "lang [@zip]",
    cases: [
      {
        name: "should pair elements from two arrays",
        input: `@zip([1 2 3] ["a" "b" "c"])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(3);
          expect(result[0]).to.be.an("array").with.lengthOf(2);
          expect(result[0][0]).to.be.instanceOf(Num);
          expect(result[0][1]).to.equal("a");
          expect(result[2][1]).to.equal("c");
        },
      },
      {
        name: "should truncate to the shorter array",
        input: `@zip([1 2] ["a" "b" "c"])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(2);
        },
      },
      {
        name: "should return empty array when either input is empty",
        input: `@zip([] [1 2])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    docCases: [
      {
        description: "Zip two arrays",
        code: `load lang [@zip]\nset $keys [1 2 3]\nset $vals ["a" "b" "c"]\nset $pairs @zip($keys $vals)`,
        preamble: "",
      },
    ],
    sampleArgs: [`[1]`, `[2]`],
  },
  helpers.zip.argDefs,
);
