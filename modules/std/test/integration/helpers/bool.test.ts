import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@bool", {
  skipArgLengthCheck: true,
  cases: [
    {
      name: "should return true for a truthy number",
      input: "@bool(1)",
      expected: "true",
    },
    {
      name: "should return false for zero",
      input: "@bool(0)",
      expected: "false",
    },
    {
      name: "should return true for a non-empty string",
      input: `@bool("hello")`,
      expected: "true",
    },
    {
      name: "should return false for an empty string",
      input: `@bool("")`,
      expected: "false",
    },
    {
      name: 'should return false for "false"',
      input: "@bool(false)",
      expected: "false",
    },
    {
      name: 'should return true for "true"',
      input: "@bool(true)",
      expected: "true",
    },
    {
      name: "should return true for equal numbers (==)",
      input: "@bool(1 == 1)",
      expected: "true",
    },
    {
      name: "should return false for unequal numbers (==)",
      input: "@bool(1 == 2)",
      expected: "false",
    },
    {
      name: "should return true for unequal numbers (!=)",
      input: "@bool(1 != 2)",
      expected: "true",
    },
    {
      name: "should return false for equal numbers (!=)",
      input: "@bool(1 != 1)",
      expected: "false",
    },
    {
      name: "should return true for greater-than (>)",
      input: "@bool(5 > 3)",
      expected: "true",
    },
    {
      name: "should return false for not greater-than (>)",
      input: "@bool(3 > 5)",
      expected: "false",
    },
    {
      name: "should return true for greater-or-equal (>=)",
      input: "@bool(5 >= 5)",
      expected: "true",
    },
    {
      name: "should return true for less-than (<)",
      input: "@bool(2 < 10)",
      expected: "true",
    },
    {
      name: "should return true for less-or-equal (<=)",
      input: "@bool(7 <= 7)",
      expected: "true",
    },
    {
      name: "should return true for equal strings (==)",
      input: `@bool("hello" == "hello")`,
      expected: "true",
    },
    {
      name: "should return false for unequal strings (==)",
      input: `@bool("hello" == "world")`,
      expected: "false",
    },
    {
      name: "should evaluate 'and' operator",
      input: "@bool(1 == 1 and 2 > 1)",
      expected: "true",
    },
    {
      name: "should evaluate 'and' with false",
      input: "@bool(1 == 2 and 2 > 1)",
      expected: "false",
    },
    {
      name: "should evaluate 'or' operator",
      input: "@bool(1 == 2 or 2 > 1)",
      expected: "true",
    },
    {
      name: "should evaluate 'or' both false",
      input: "@bool(1 == 2 or 3 < 1)",
      expected: "false",
    },
    {
      name: "should evaluate 'not' operator",
      input: "@bool(not false)",
      expected: "true",
    },
    {
      name: "should evaluate 'not true'",
      input: "@bool(not true)",
      expected: "false",
    },
    {
      name: "should respect precedence: 'and' before 'or'",
      input: "@bool(true or false and false)",
      expected: "true",
    },
    {
      name: "should support grouping with parens",
      input: "@bool((true or false) and true)",
      expected: "true",
    },
    {
      name: "should work with nested @num for arithmetic",
      input: "@bool(@num(2 + 2) == 4)",
      expected: "true",
    },
    {
      name: "should work with nested @num in comparison",
      input: "@bool(@num(3 + 4) > 5)",
      expected: "true",
    },
  ],
  docCases: [
    {
      description: "Comparisons",
      code: `set $a @bool(1 == 1)\nset $b @bool(5 > 3)\nset $c @bool(5 <= 3)`,
    },
    {
      description: "Logical operators",
      code: `set $e @bool(true and true)\nset $f @bool(true or false)\nset $g @bool(not false)`,
    },
    {
      description: "Compound expression",
      code: `set $x 10\nset $h @bool($x > 0 and $x < 100)`,
    },
  ],
  errorCases: [
    {
      name: "should fail when comparing non-numeric values with >",
      input: `@bool("a" > "b")`,
      error: "requires numeric operands",
    },
    {
      name: "should fail for arithmetic operators",
      input: "@bool(1 + 2)",
      error: "not valid in @bool",
    },
  ],
});
