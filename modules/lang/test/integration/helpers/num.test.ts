import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@num.parse",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Parse ETH to wei (18 decimals)",
        code: `set $wei @num.parse("1.5" 18)`,
      },
      {
        description: "Parse USDC (6 decimals)",
        code: `set $raw @num.parse("1.5" 6)`,
      },
    ],
    sampleArgs: [`"1"`, "6"],
  },
  helpers["num.parse"].argDefs,
);

describeHelper(
  "@num.format",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Format wei to ETH (18 decimals)",
        code: `set $eth @num.format(1500000000000000000 18)`,
      },
      {
        description: "Format USDC (6 decimals)",
        code: `set $usd @num.format(1500000 6)`,
      },
    ],
    sampleArgs: ["1000000", "6"],
  },
  helpers["num.format"].argDefs,
);
