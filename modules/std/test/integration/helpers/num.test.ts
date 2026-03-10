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

describeHelper("@num.parse", {
  cases: [
    {
      name: "should parse with 18 decimals",
      input: `@num.parse("1.5" 18)`,
      validate(result) {
        expect(result.eq(Num(1500000000000000000n))).to.be.true;
      },
    },
    {
      name: "should parse whole numbers",
      input: `@num.parse("1" 6)`,
      validate(result) {
        expect(result.eq(Num(1000000n))).to.be.true;
      },
    },
  ],
  sampleArgs: [`"1"`, "6"],
}, helpers["num.parse"].argDefs);

describeHelper("@num.format", {
  cases: [
    {
      name: "should format with 18 decimals",
      input: "@num.format(1500000000000000000 18)",
      expected: "1.5",
    },
    {
      name: "should format with 6 decimals",
      input: "@num.format(1000000 6)",
      expected: "1",
    },
    {
      name: "should format zero",
      input: "@num.format(0 18)",
      expected: "0",
    },
    {
      name: "should format a small value",
      input: "@num.format(1 18)",
      expected: "0.000000000000000001",
    },
  ],
  sampleArgs: ["1000000", "6"],
}, helpers["num.format"].argDefs);
