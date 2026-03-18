import "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";

describeHelper("@bytes", {
  skipArgLengthCheck: true,
  cases: [
    {
      name: "should convert a number to hex",
      input: "@bytes(2)",
      expected: "0x2",
    },
    {
      name: "should UTF-8 encode a plain string",
      input: `@bytes("hello world")`,
      expected: "0x68656c6c6f20776f726c64",
    },
    {
      name: "should UTF-8 encode a single char",
      input: `@bytes("2")`,
      expected: "0x32",
    },
    {
      name: "should pass through a hex bareword",
      input: "@bytes(0xff)",
      expected: "0xff",
    },
    {
      name: "should force UTF-8 encoding with utf8 flag",
      input: `@bytes("0x01" utf8)`,
      expected: "0x30783031",
    },
    {
      name: "should force UTF-8 even for non-hex strings",
      input: `@bytes("hello" utf8)`,
      expected: "0x68656c6c6f",
    },
    {
      name: "should perform bitwise AND",
      input: "@bytes(0xff & 0x0f)",
      expected: "0xf",
    },
    {
      name: "should perform bitwise OR",
      input: "@bytes(0xf0 | 0x0f)",
      expected: "0xff",
    },
    {
      name: "should perform left shift",
      input: "@bytes(1 << 8)",
      expected: "0x100",
    },
    {
      name: "should perform right shift",
      input: "@bytes(256 >> 4)",
      expected: "0x10",
    },
    {
      name: "should work with @num expressions",
      input: "@bytes(@num(2 + 2) << 1)",
      expected: "0x8",
    },
    {
      name: "should compose with nested @bytes",
      input: "@bytes(@bytes(0xff & 0x0f) | 0x10)",
      expected: "0x1f",
    },
  ],
  docCases: [
    { description: "Convert a number to bytes", code: `set $b @bytes(0xff)` },
    { description: "Bitwise AND", code: `set $b @bytes(0xff00 "&" 0x0ff0)` },
    { description: "Left shift", code: `set $b @bytes(0x01 "<<" 8)` },
  ],
  errorCases: [
    {
      name: "should reject invalid 2-arg form",
      input: "@bytes(1 &)",
      error: "@bytes expects 1 arg (conversion), 2 with utf8, or 3 (bitwise)",
    },
    {
      name: "should reject unrecognized operator",
      input: "@bytes(1 ** 2)",
      error: "not recognized",
    },
    {
      name: "should reject non-integer operand",
      input: "@bytes(1.5 & 1)",
      error: "must be an integer",
    },
  ],
});
