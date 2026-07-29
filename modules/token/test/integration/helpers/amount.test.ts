import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token:amount",
  {
    module: "token",
    cases: [
      {
        name: "should convert 1 DAI to base units (18 decimals)",
        input: "@token:amount(DAI 1)",
        expected: String(1e18),
      },
      {
        name: "should convert a larger amount",
        input: "@token:amount(DAI 100)",
        expected: String(100e18),
      },
      {
        name: "should convert a decimal amount (0.5 DAI)",
        input: '@token:amount(DAI "0.5")',
        expected: "500000000000000000",
      },
      {
        name: "should convert native token amount to base units",
        input: "@token:amount(XDAI 1)",
        expected: String(1e18),
      },
    ],
    docCases: [
      {
        description: "Convert 100 DAI to base units",
        code: `set $amount @token:amount(DAI 100)`,
      },
    ],
    sampleArgs: ["DAI", "1"],
  },
  helpers.amount.argDefs,
);
