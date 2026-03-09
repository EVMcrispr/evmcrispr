import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.includes", {
  cases: [
    {
      name: "should return true when string contains substring",
      input: `@str.includes("hello world", "world")`,
      expected: "true",
    },
    {
      name: "should return false when string does not contain substring",
      input: `@str.includes("hello", "xyz")`,
      expected: "false",
    },
    {
      name: "should return true for exact match",
      input: `@str.includes("abc", "abc")`,
      expected: "true",
    },
    {
      name: "should return true for empty substring",
      input: `@str.includes("hello", "")`,
      expected: "true",
    },
  ],
  sampleArgs: [`"a"`, `"b"`],
}, helpers["str.includes"].argDefs);
