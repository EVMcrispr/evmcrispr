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
        name: "should zip two empty arrays",
        input: `@zip([] [])`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    errorCases: [
      {
        name: "should reject unequal lengths",
        input: `@zip([1 2] ["a" "b" "c"])`,
        error: "same length",
      },
      {
        name: "should reject an empty lane paired with a nonempty lane",
        input: `@zip([] [1 2])`,
        error: "same length",
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
