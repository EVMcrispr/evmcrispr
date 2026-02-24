import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@filter", {
  cases: [
    {
      name: "should keep elements where helper returns true",
      input: `@filter([true, false, true], @not)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(1);
        expect(result[0]).to.equal(false);
      },
    },
    {
      name: "should return empty array when nothing matches",
      input: `@filter([true, true], @not)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@filter([], @not)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@filter([1, 2], "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.filter.argDefs);
