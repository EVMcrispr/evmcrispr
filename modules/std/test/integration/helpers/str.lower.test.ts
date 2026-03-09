import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.lower", {
  cases: [
    {
      name: "should convert to lowercase",
      input: `@str.lower("HELLO")`,
      expected: "hello",
    },
    {
      name: "should handle already lowercase string",
      input: `@str.lower("abc")`,
      expected: "abc",
    },
    {
      name: "should handle mixed case",
      input: `@str.lower("Hello World")`,
      expected: "hello world",
    },
  ],
}, helpers["str.lower"].argDefs);
