import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.concat", {
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
  sampleArgs: [`"a"`],
}, helpers["str.concat"].argDefs);
