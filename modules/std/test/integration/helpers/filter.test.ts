import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@filter", {
  cases: [
    {
      name: "should keep elements where helper returns true",
      input: `@filter([1 0 2 0 3] @bool)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(3);
        expect(result[0]).to.be.instanceOf(Num);
      },
    },
    {
      name: "should return empty array when nothing matches",
      input: `@filter([0 0] @bool)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@filter([] @bool)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@filter([1 2] "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.filter.argDefs);
