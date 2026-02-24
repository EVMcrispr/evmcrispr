import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@bool", {
  cases: [
    {
      name: "should return true for equal numbers (==)",
      input: "@bool(1, ==, 1)",
      expected: "true",
    },
    {
      name: "should return false for unequal numbers (==)",
      input: "@bool(1, ==, 2)",
      expected: "false",
    },
    {
      name: "should return true for unequal numbers (!=)",
      input: "@bool(1, !=, 2)",
      expected: "true",
    },
    {
      name: "should return false for equal numbers (!=)",
      input: "@bool(1, !=, 1)",
      expected: "false",
    },
    {
      name: "should return true for greater-than (>)",
      input: "@bool(5, >, 3)",
      expected: "true",
    },
    {
      name: "should return false for not greater-than (>)",
      input: "@bool(3, >, 5)",
      expected: "false",
    },
    {
      name: "should return true for greater-or-equal (>=)",
      input: "@bool(5, >=, 5)",
      expected: "true",
    },
    {
      name: "should return true for less-than (<)",
      input: "@bool(2, <, 10)",
      expected: "true",
    },
    {
      name: "should return true for less-or-equal (<=)",
      input: "@bool(7, <=, 7)",
      expected: "true",
    },
    {
      name: "should return true for equal strings (==)",
      input: `@bool("hello", ==, "hello")`,
      expected: "true",
    },
    {
      name: "should return false for unequal strings (==)",
      input: `@bool("hello", ==, "world")`,
      expected: "false",
    },
    {
      name: "should work with arithmetic expressions",
      input: "@bool((2 + 2), ==, 4)",
      expected: "true",
    },
  ],
  errorCases: [
    {
      name: "should fail with an unrecognized operator",
      input: "@bool(1, ~~, 1)",
      error: "not recognized",
    },
    {
      name: "should fail when comparing non-numeric values with >",
      input: `@bool("a", >, "b")`,
      error: "must be used between two numbers",
    },
  ],
  sampleArgs: ["1", "==", "1"],
}, helpers.bool.argDefs);
