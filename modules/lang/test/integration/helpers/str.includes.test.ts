import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.includes",
  {
    module: "lang [@str.includes]",
    cases: [
      {
        name: "should return true when string contains substring",
        input: `@str.includes("hello world" "world")`,
        expected: "true",
      },
      {
        name: "should return false when string does not contain substring",
        input: `@str.includes("hello" "xyz")`,
        expected: "false",
      },
      {
        name: "should return true for exact match",
        input: `@str.includes("abc" "abc")`,
        expected: "true",
      },
      {
        name: "should return true for empty substring",
        input: `@str.includes("hello" "")`,
        expected: "true",
      },
    ],
    docCases: [
      {
        description: "Check if string contains substring",
        code: `load lang [@str.includes]\nprint @str.includes("hello world" "world")`,
        preamble: "",
      },
      {
        description: "Check for missing substring",
        code: `load lang [@str.includes]\nprint @str.includes("hello world" "xyz")`,
        preamble: "",
      },
    ],
    sampleArgs: [`"a"`, `"b"`],
  },
  helpers["str.includes"].argDefs,
);
