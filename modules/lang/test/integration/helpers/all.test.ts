import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@all",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Check all positive",
        code: `def @isPositive "$n: number -> bool" @bool($n > 0)\nprint @all([1 2 3] @isPositive)`,
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
  },
  helpers.all.argDefs,
);
