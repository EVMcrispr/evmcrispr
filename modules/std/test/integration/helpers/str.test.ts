import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";

describeHelper("@str", {
  cases: [
    {
      name: "should convert a number to string",
      input: "@str(42)",
      expected: "42",
    },
    {
      name: "should convert true to string",
      input: "@str(true)",
      expected: "true",
    },
    {
      name: "should convert false to string",
      input: "@str(false)",
      expected: "false",
    },
    {
      name: "should pass through a string unchanged",
      input: `@str("hello")`,
      expected: "hello",
    },
    {
      name: "should convert a hex value to string",
      input: "@str(0xff)",
      expected: "0xff",
    },
    {
      name: "should work with arithmetic expressions",
      input: "@str((2 + 2))",
      expected: "4",
    },
  ],
});
