import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@map", {
  cases: [
    {
      name: "should apply @str.upper to each element",
      input: `@map(["hello" "world"] @str.upper)`,
      validate(result) {
        expect(result).to.deep.equal(["HELLO", "WORLD"]);
      },
    },
    {
      name: "should apply @not to each element",
      input: `@map([true false true] @not)`,
      validate(result) {
        expect(result).to.deep.equal(["false", "true", "false"]);
      },
    },
    {
      name: "should return empty array for empty input",
      input: `@map([] @str.upper)`,
      validate(result) {
        expect(result).to.be.an("array").with.lengthOf(0);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@map([1 2] "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.map.argDefs);
