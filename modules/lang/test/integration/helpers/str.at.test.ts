import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.at",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Get the first character",
        code: `set $s "hello"\nset $c @str.at($s 0)`,
      },
      {
        description: "Get the last character (negative index)",
        code: `set $s "hello"\nset $l @str.at($s -1)`,
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
  },
  helpers["str.at"].argDefs,
);
