import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.replace", {
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
}, helpers["str.replace"].argDefs);
