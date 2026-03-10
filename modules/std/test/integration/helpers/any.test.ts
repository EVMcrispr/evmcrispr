import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@any", {
  preamble: `def @isTrue "$x: any -> bool" @bool($x)`,
  cases: [
    {
      name: "should return true when at least one element matches",
      input: `@any([false, true, false], @isTrue)`,
      expected: "true",
    },
    {
      name: "should return false when no element matches",
      input: `@any([false, false], @isTrue)`,
      expected: "false",
    },
    {
      name: "should return false for empty array",
      input: `@any([], @isTrue)`,
      expected: "false",
    },
  ],
  errorCases: [
    {
      name: "should fail when second argument is not a helper",
      input: `@any([1, 2], "notAHelper")`,
      error: "must be a helper reference",
    },
  ],
  skipArgLengthCheck: true,
}, helpers.any.argDefs);
