import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.replace",
  {
    module: "lang [@str.replace]",
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
      {
        description: "Replace all occurrences",
        code: `load lang [@str.replace]\nset $s @str.replace("foo-bar-baz" "-" "_")`,
        preamble: "",
      },
      {
        description: "Remove a substring",
        code: `load lang [@str.replace]\nset $s @str.replace("hello world" " world" "")`,
        preamble: "",
      },
    ],
  },
  helpers["str.replace"].argDefs,
);
