import "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token",
  {
    cases: [
      {
        name: "should resolve a token symbol to its address",
        input: "@token(DAI)",
        expected: "0x44fA8E6f47987339850636F88629646662444217",
      },
      {
        name: "should resolve the chain native token to the zero address",
        input: "@token(XDAI)",
        expected: "0x0000000000000000000000000000000000000000",
      },
      {
        name: "should resolve native token case-insensitively",
        input: "@token(xdai)",
        expected: "0x0000000000000000000000000000000000000000",
      },
      {
        name: "should pass through a valid address unchanged",
        input: "@token(0x44fA8E6f47987339850636F88629646662444217)",
        expected: "0x44fA8E6f47987339850636F88629646662444217",
      },
    ],
    errorCases: [
      {
        name: "should fail for an unsupported token symbol",
        input: "@token(NONEXISTENT_TOKEN_XYZ)",
        error: "not supported",
      },
    ],
    sampleArgs: ["DAI"],
  },
  helpers.token.argDefs,
);

describeHelper("@token", {
  describeName: "Std > helpers > @token > tokenlist validation",
  preamble: 'set $token.tokenlist "http://evil.example.com"',
  skipArgLengthCheck: true,
  errorCases: [
    {
      name: "should fail when tokenlist URL is not HTTPS",
      input: "@token(DAI)",
      error: "must be a valid HTTPS URL",
    },
  ],
});

describeHelper(
  "@token.balance",
  {
    cases: [
      {
        name: "should return ERC-20 balance for a holder",
        input: "@token.balance(DAI,@token(DAI))",
        expected: "12100000000000000000",
      },
      {
        name: "should return native token balance for a holder",
        input:
          "@token.balance(XDAI,0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6)",
        validate: (result) => {
          expect(Number(result)).to.be.greaterThanOrEqual(0);
        },
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)"],
  },
  helpers["token.balance"].argDefs,
);

describeHelper(
  "@token.amount",
  {
    cases: [
      {
        name: "should convert 1 DAI to base units (18 decimals)",
        input: "@token.amount(DAI, 1)",
        expected: String(1e18),
      },
      {
        name: "should convert a larger amount",
        input: "@token.amount(DAI, 100)",
        expected: String(100e18),
      },
      {
        name: "should convert a decimal amount (0.5 DAI)",
        input: '@token.amount(DAI, "0.5")',
        expected: "500000000000000000",
      },
      {
        name: "should convert native token amount to base units",
        input: "@token.amount(XDAI, 1)",
        expected: String(1e18),
      },
    ],
    sampleArgs: ["DAI", "1"],
  },
  helpers["token.amount"].argDefs,
);
