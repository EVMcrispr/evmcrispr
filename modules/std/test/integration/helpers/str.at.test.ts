import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.at", {
  cases: [
    {
      name: "should return character at index in string",
      input: `@str.at("hello" 1)`,
      expected: "e",
    },
    {
      name: "should support negative indices in string",
      input: `@str.at("hello" -1)`,
      expected: "o",
    },
    {
      name: "should return first character at index 0",
      input: `@str.at("abc" 0)`,
      expected: "a",
    },
  ],
  errorCases: [
    {
      name: "should fail on out-of-bounds index",
      input: `@str.at("ab" 5)`,
      error: "out of bounds",
    },
    {
      name: "should fail on negative out-of-bounds",
      input: `@str.at("a" -3)`,
      error: "out of bounds",
    },
  ],
  sampleArgs: [`"a"`, `0`],
}, helpers["str.at"].argDefs);
