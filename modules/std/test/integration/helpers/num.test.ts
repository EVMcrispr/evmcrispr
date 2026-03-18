import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@num", {
  skipArgLengthCheck: true,
  cases: [
    {
      name: "should convert a string to a number",
      input: `@num("42")`,
      validate(result) {
        expect(result).to.be.instanceOf(Num);
        expect(result.eq(Num(42n))).to.be.true;
      },
    },
    {
      name: "should convert a hex value to a number",
      input: "@num(0xff)",
      validate(result) {
        expect(result.eq(Num(255n))).to.be.true;
      },
    },
    {
      name: "should convert true to 1",
      input: "@num(true)",
      validate(result) {
        expect(result.eq(Num(1n))).to.be.true;
      },
    },
    {
      name: "should convert false to 0",
      input: "@num(false)",
      validate(result) {
        expect(result.eq(Num(0n))).to.be.true;
      },
    },
    {
      name: "should pass through a number unchanged",
      input: "@num(100)",
      validate(result) {
        expect(result.eq(Num(100n))).to.be.true;
      },
    },
    {
      name: "should evaluate addition",
      input: "@num(3 + 4)",
      validate(result) {
        expect(result.eq(Num(7n))).to.be.true;
      },
    },
    {
      name: "should respect operator precedence (mul before add)",
      input: "@num(3 + 4 * 2)",
      validate(result) {
        expect(result.eq(Num(11n))).to.be.true;
      },
    },
    {
      name: "should evaluate division with precedence",
      input: "@num(3 + 4 / 4)",
      validate(result) {
        expect(result.eq(Num(4n))).to.be.true;
      },
    },
    {
      name: "should evaluate exponentiation",
      input: "@num(2 ^ 10)",
      validate(result) {
        expect(result.eq(Num(1024n))).to.be.true;
      },
    },
    {
      name: "should evaluate modulo",
      input: "@num(10 % 3)",
      validate(result) {
        expect(result.eq(Num(1n))).to.be.true;
      },
    },
    {
      name: "should evaluate integer division",
      input: "@num(10 // 3)",
      validate(result) {
        expect(result.eq(Num(3n))).to.be.true;
      },
    },
    {
      name: "should handle unary minus",
      input: "@num(- 3 + 5)",
      validate(result) {
        expect(result.eq(Num(2n))).to.be.true;
      },
    },
    {
      name: "should handle grouping with parens",
      input: "@num(10 * (10 - 9))",
      validate(result) {
        expect(result.eq(Num(10n))).to.be.true;
      },
    },
    {
      name: "should handle nested grouping",
      input: "@num((2 + 3) * (4 - 1))",
      validate(result) {
        expect(result.eq(Num(15n))).to.be.true;
      },
    },
  ],
  docCases: [
    { description: "Basic arithmetic", code: `set $sum @num(1 + 2)` },
    { description: "Exponentiation", code: `set $pow @num(2 ^ 10)` },
    { description: "Expression with variables", code: `set $a 10\nset $b 3\nset $result @num($a * $b + 1)` },
    { description: "Convert a string to number", code: `set $n @num("42")` },
  ],
  errorCases: [
    {
      name: "should reject an unconvertible value",
      input: `@num("not_a_number")`,
      error: "",
    },
    {
      name: "should reject missing spaces around operator",
      input: "@num(1+1)",
      error: "Missing spaces",
    },
    {
      name: "should reject boolean operators",
      input: "@num(1 and 2)",
      error: "not valid in @num",
    },
  ],
});
