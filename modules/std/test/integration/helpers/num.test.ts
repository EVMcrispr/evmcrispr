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
        expect(result.eq(new Num(42n))).to.be.true;
      },
    },
    {
      name: "should convert a hex value to a number",
      input: "@num(0xff)",
      validate(result) {
        expect(result.eq(new Num(255n))).to.be.true;
      },
    },
    {
      name: "should convert true to 1",
      input: "@num(true)",
      validate(result) {
        expect(result.eq(new Num(1n))).to.be.true;
      },
    },
    {
      name: "should convert false to 0",
      input: "@num(false)",
      validate(result) {
        expect(result.eq(new Num(0n))).to.be.true;
      },
    },
    {
      name: "should pass through a number unchanged",
      input: "@num(100)",
      validate(result) {
        expect(result.eq(new Num(100n))).to.be.true;
      },
    },
    {
      name: "should apply decimal shift with 2-arg form",
      input: `@num("1.5", 18)`,
      validate(result) {
        expect(result.eq(new Num(1500000000000000000n))).to.be.true;
      },
    },
    {
      name: "should apply decimal shift for whole numbers",
      input: `@num("1", 6)`,
      validate(result) {
        expect(result.eq(new Num(1000000n))).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "should reject an unconvertible value",
      input: `@num("not_a_number")`,
      error: "",
    },
  ],
});

describeHelper("@num.format", {
  cases: [
    {
      name: "should format with 18 decimals",
      input: "@num.format(1500000000000000000, 18)",
      expected: "1.5",
    },
    {
      name: "should format with 6 decimals",
      input: "@num.format(1000000, 6)",
      expected: "1",
    },
    {
      name: "should format zero",
      input: "@num.format(0, 18)",
      expected: "0",
    },
    {
      name: "should format a small value",
      input: "@num.format(1, 18)",
      expected: "0.000000000000000001",
    },
  ],
  sampleArgs: ["1000000", "6"],
}, helpers["num.format"].argDefs);
