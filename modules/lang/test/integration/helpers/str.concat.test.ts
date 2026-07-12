import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.concat",
  {
    module: "lang [@str.concat]",
    cases: [
      {
        name: "should concatenate two strings",
        input: `@str.concat("hello" " world")`,
        expected: "hello world",
      },
      {
        name: "should concatenate multiple strings",
        input: `@str.concat("a" "b" "c")`,
        expected: "abc",
      },
      {
        name: "should return a single string unchanged",
        input: `@str.concat("solo")`,
        expected: "solo",
      },
    ],
    docCases: [
      {
        description: "Concatenate strings",
        code: `load lang [@str.concat]\nset $full @str.concat("hello" " " "world")`,
        preamble: "",
      },
      {
        description: "Concatenate with helper result",
        code: `load lang [@str.concat]\nset $greeting @str.concat("hi " @str(@me))`,
        preamble: "",
      },
    ],
    sampleArgs: [`"a"`],
  },
  helpers["str.concat"].argDefs,
);
