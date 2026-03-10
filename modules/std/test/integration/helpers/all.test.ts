import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@all", {
  preamble: `def @isTrue "$x: any -> bool" @bool($x)`,
  cases: [
    {
      name: "should return true when all elements match",
      input: `@all([true true true] @isTrue)`,
      expected: "true",
    },
    {
      name: "should return false when any element does not match",
      input: `@all([true false true] @isTrue)`,
      expected: "false",
    },
    {
      name: "should return true for empty array",
      input: `@all([] @isTrue)`,
      expected: "true",
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@all([1 2] "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.all.argDefs);
