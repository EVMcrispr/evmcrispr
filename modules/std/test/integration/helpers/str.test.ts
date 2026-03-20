import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str",
  {
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
        name: "should work with @num expressions",
        input: "@str(@num(2 + 2))",
        expected: "4",
      },
      {
        name: "should decode hex bytes as UTF-8 with utf8 flag",
        input: "@str(0x48656c6c6f utf8)",
        expected: "Hello",
      },
      {
        name: "should decode @bytes output back to the original string",
        input: `@str(@bytes("world") utf8)`,
        expected: "world",
      },
    ],
    docCases: [
      { description: "Convert a number to string", code: `set $s @str(42)` },
      { description: "Convert an address to string", code: `set $s @str(@me)` },
      {
        description: "Decode hex bytes as UTF-8",
        code: `set $s @str(0x48656c6c6f utf8)\nprint $s`,
      },
    ],
    sampleArgs: ["0x48656c6c6f", "utf8"],
  },
  helpers.str.argDefs,
);
