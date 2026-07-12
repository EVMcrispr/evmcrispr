import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@any",
  {
    module: "lang [@any]",
    preamble: `def @isTrue "$x: any -> bool" @bool($x)`,
    cases: [
      {
        name: "should return true when at least one element matches",
        input: `@any([false true false] @isTrue)`,
        expected: "true",
      },
      {
        name: "should return false when no element matches",
        input: `@any([false false] @isTrue)`,
        expected: "false",
      },
      {
        name: "should return false for empty array",
        input: `@any([] @isTrue)`,
        expected: "false",
      },
    ],
    docCases: [
      {
        description: "Check if any negative",
        code: `load lang [@any]\ndef @isNegative "$n: number -> bool" @bool($n < 0)\nprint @any([1 -2 3] @isNegative)`,
        preamble: "",
      },
    ],
    errorCases: [
      {
        name: "should fail when second argument is not a helper",
        input: `@any([1 2] "notAHelper")`,
        error: "must be a helper reference",
      },
    ],
    skipArgLengthCheck: true,
  },
  helpers.any.argDefs,
);
