import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@includes", {
  cases: [
    {
      name: "should return true when string contains substring",
      input: `@includes("hello world", "world")`,
      expected: "true",
    },
    {
      name: "should return false when string does not contain substring",
      input: `@includes("hello", "xyz")`,
      expected: "false",
    },
    {
      name: "should return true when array contains element",
      input: `@includes([1, 2, 3], 2)`,
      expected: "true",
    },
    {
      name: "should return false when array does not contain element",
      input: `@includes([1, 2, 3], 9)`,
      expected: "false",
    },
    {
      name: "should return true for string element in array",
      input: `@includes(["a", "b"], "b")`,
      expected: "true",
    },
    {
      name: "should return false for missing string in array",
      input: `@includes(["a", "b"], "c")`,
      expected: "false",
    },
  ],
  sampleArgs: [`"a"`, `"b"`],
}, helpers.includes.argDefs);
