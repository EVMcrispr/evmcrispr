import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@includes",
  {
    module: "lang [@includes]",
    cases: [
      {
        name: "should return true when array contains element",
        input: `@includes([1 2 3] 2)`,
        expected: "true",
      },
      {
        name: "should return false when array does not contain element",
        input: `@includes([1 2 3] 9)`,
        expected: "false",
      },
      {
        name: "should return true for string element in array",
        input: `@includes(["a" "b"] "b")`,
        expected: "true",
      },
      {
        name: "should return false for missing string in array",
        input: `@includes(["a" "b"] "c")`,
        expected: "false",
      },
    ],
    docCases: [
      {
        description: "Check if array contains element",
        code: `load lang [@includes]\nset $arr [1 2 3]\nprint @includes($arr 2)`,
        preamble: "",
      },
      {
        description: "Check for missing element",
        code: `load lang [@includes]\nset $arr [1 2 3]\nprint @includes($arr 99)`,
        preamble: "",
      },
    ],
    sampleArgs: [`[1]`, `1`],
  },
  helpers.includes.argDefs,
);
