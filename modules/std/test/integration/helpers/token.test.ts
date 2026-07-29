import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
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
