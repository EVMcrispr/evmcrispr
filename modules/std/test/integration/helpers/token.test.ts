import "../../setup";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
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
    docCases: [
      { description: "Resolve a token symbol", code: `set $dai @token(DAI)` },
      {
        description: "Resolve the native token",
        code: `set $native @token(XDAI)`,
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
  preamble: 'set $std:tokenlist "http://evil.example.com"',
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
        input: "@token.balance(DAI @token(DAI))",
        // Compare against a direct eth_call instead of a pinned value:
        // other suites sharing the anvil fork move tokens, so the balance
        // is only deterministic on a fresh fork.
        validate: async (result) => {
          const dai = "0x44fA8E6f47987339850636F88629646662444217";
          const balance = (await getPublicClient().readContract({
            address: dai,
            abi: parseAbi([
              "function balanceOf(address) view returns (uint256)",
            ]),
            functionName: "balanceOf",
            args: [dai],
          })) as bigint;
          expect(String(result)).to.eq(String(balance));
        },
      },
      {
        name: "should return native token balance for a holder",
        input:
          "@token.balance(XDAI 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6)",
        validate: (result) => {
          expect(Number(result)).to.be.greaterThanOrEqual(0);
        },
      },
    ],
    docCases: [
      {
        description: "Query a token balance",
        code: `set $bal @token.balance(DAI @token(DAI))`,
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)"],
  },
  helpers["token.balance"].argDefs,
);

describeHelper(
  "@token.format",
  {
    cases: [
      {
        name: "should format a base-unit amount of an ERC-20 token",
        input: "@token.format(DAI 500000000000000000)",
        expected: "0.5 DAI",
      },
      {
        name: "should format a token given by address",
        input:
          "@token.format(0x44fA8E6f47987339850636F88629646662444217 1500000000000000000)",
        expected: "1.5 DAI",
      },
      {
        name: "should format a native token amount",
        input: "@token.format(XDAI 1e18)",
        expected: "1 XDAI",
      },
    ],
    docCases: [
      {
        description: "Format a base-unit amount as a human-readable string",
        code: `print @token.format(DAI 500000000000000000)`,
      },
      {
        description: "Print a holder's balance in human-readable form",
        code: `print @token.format(DAI @token.balance(DAI @token(DAI)))`,
      },
    ],
    errorCases: [
      {
        name: "should fail for a non-integer base-unit amount",
        input: '@token.format(DAI "1.5")',
        error: "expected an integer base-unit amount",
      },
    ],
    sampleArgs: ["DAI", "1000000000000000000"],
  },
  helpers["token.format"].argDefs,
);

// GNO on the pinned Gnosis fork (not in the mocked tokenlist, so used by address)
const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

describeHelper(
  "@token.allowance",
  {
    cases: [
      {
        name: "should return the allowance granted by an owner to a spender",
        input: "@token.allowance(DAI @token(DAI) @token(DAI))",
        expected: "0",
      },
    ],
    docCases: [
      {
        description: "Query an allowance",
        code: `set $allowance @token.allowance(DAI @me 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)`,
      },
      {
        description: "Top up an allowance only when it is too low",
        code: `set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
if @bool(@token.allowance(DAI @me $spender) < @token.amount(DAI 100)) (
  exec @token(DAI) "approve(address,uint256)" $spender @token.amount(DAI 100)
)`,
      },
    ],
    errorCases: [
      {
        name: "should fail for the native token",
        input: "@token.allowance(XDAI @me @me)",
        error: "native token has no allowances",
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)", "@token(DAI)"],
  },
  helpers["token.allowance"].argDefs,
);

describeHelper(
  "@token.decimals",
  {
    cases: [
      {
        name: "should return the decimals of an ERC-20 token",
        input: "@token.decimals(DAI)",
        expected: "18",
      },
      {
        name: "should return the native token decimals",
        input: "@token.decimals(XDAI)",
        expected: "18",
      },
    ],
    docCases: [
      {
        description: "Read the decimals of a token",
        code: `set $decimals @token.decimals(DAI)`,
      },
      {
        description: "Scale an amount manually",
        code: `set $base @num(25 * 10 ^ @token.decimals(DAI))`,
      },
    ],
    sampleArgs: ["DAI"],
  },
  helpers["token.decimals"].argDefs,
);

describeHelper(
  "@token.symbol",
  {
    cases: [
      {
        name: "should return the symbol of a token given by address",
        input: `@token.symbol(${GNO})`,
        expected: "GNO",
      },
      {
        name: "should return the native token symbol",
        input: "@token.symbol(XDAI)",
        expected: "XDAI",
      },
    ],
    docCases: [
      {
        description: "Read the symbol of a token by address",
        code: `set $symbol @token.symbol(0x44fA8E6f47987339850636F88629646662444217)`,
      },
      {
        description: "The native token symbol",
        code: `print @token.symbol(0x0000000000000000000000000000000000000000)`,
      },
    ],
    sampleArgs: [GNO],
  },
  helpers["token.symbol"].argDefs,
);

describeHelper(
  "@token.totalSupply",
  {
    cases: [
      {
        name: "should return the total supply of an ERC-20 token",
        input: `@token.totalSupply(${GNO})`,
        // Compare against a direct eth_call instead of a pinned value:
        // other suites sharing the anvil fork mint/burn tokens, so the
        // supply is only deterministic on a fresh fork.
        validate: async (result) => {
          const supply = (await getPublicClient().readContract({
            address: GNO,
            abi: parseAbi(["function totalSupply() view returns (uint256)"]),
            functionName: "totalSupply",
          })) as bigint;
          expect(String(result)).to.eq(String(supply));
          expect(supply > 0n).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Query the total supply of a token",
        code: `set $supply @token.totalSupply(DAI)`,
      },
      {
        description: "Print the total supply in human-readable form",
        code: `print @token.format(DAI @token.totalSupply(DAI))`,
      },
    ],
    errorCases: [
      {
        name: "should fail for the native token",
        input: "@token.totalSupply(XDAI)",
        error: "native token has no total supply",
      },
    ],
    sampleArgs: [GNO],
  },
  helpers["token.totalSupply"].argDefs,
);

describeHelper(
  "@token.amount",
  {
    cases: [
      {
        name: "should convert 1 DAI to base units (18 decimals)",
        input: "@token.amount(DAI 1)",
        expected: String(1e18),
      },
      {
        name: "should convert a larger amount",
        input: "@token.amount(DAI 100)",
        expected: String(100e18),
      },
      {
        name: "should convert a decimal amount (0.5 DAI)",
        input: '@token.amount(DAI "0.5")',
        expected: "500000000000000000",
      },
      {
        name: "should convert native token amount to base units",
        input: "@token.amount(XDAI 1)",
        expected: String(1e18),
      },
    ],
    docCases: [
      {
        description: "Convert 100 DAI to base units",
        code: `set $amount @token.amount(DAI 100)`,
      },
    ],
    sampleArgs: ["DAI", "1"],
  },
  helpers["token.amount"].argDefs,
);
