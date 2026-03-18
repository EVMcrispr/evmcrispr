import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.replace", {
  module: "lang",
  cases: [
    {
      name: "should replace a substring",
      input: `@str.replace("hello world" "world" "there")`,
      expected: "hello there",
    },
    {
      name: "should replace all occurrences",
      input: `@str.replace("aabaa" "a" "x")`,
      expected: "xxbxx",
    },
    {
      name: "should handle no match",
      input: `@str.replace("hello" "xyz" "abc")`,
      expected: "hello",
    },
  ],
  docCases: [
    { description: "Replace all occurrences", code: `set $s @str.replace("foo-bar-baz" "-" "_")` },
    { description: "Remove a substring", code: `set $s @str.replace("hello world" " world" "")` },
  ],
}, helpers["str.replace"].argDefs);
