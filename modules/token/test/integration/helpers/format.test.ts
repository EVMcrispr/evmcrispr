import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token:format",
  {
    module: "token",
    cases: [
      {
        name: "should format a base-unit amount of an ERC-20 token",
        input: "@token:format(DAI 500000000000000000)",
        expected: "0.5 DAI",
      },
      {
        name: "should format a token given by address",
        input:
          "@token:format(0x44fA8E6f47987339850636F88629646662444217 1500000000000000000)",
        expected: "1.5 DAI",
      },
      {
        name: "should format a native token amount",
        input: "@token:format(XDAI 1e18)",
        expected: "1 XDAI",
      },
    ],
    docCases: [
      {
        description: "Format a base-unit amount as a human-readable string",
        code: `print @token:format(DAI 500000000000000000)`,
      },
      {
        description: "Print a holder's balance in human-readable form",
        code: `print @token:format(DAI @balance(DAI @token(DAI)))`,
      },
    ],
    errorCases: [
      {
        name: "should fail for a non-integer base-unit amount",
        input: '@token:format(DAI "1.5")',
        error: "expected an integer base-unit amount",
      },
    ],
    sampleArgs: ["DAI", "1000000000000000000"],
  },
  helpers.format.argDefs,
);
