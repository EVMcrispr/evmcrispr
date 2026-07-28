import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token:decimals",
  {
    module: "token",
    cases: [
      {
        name: "should return the decimals of an ERC-20 token",
        input: "@token:decimals(DAI)",
        expected: "18",
      },
      {
        name: "should return the native token decimals",
        input: "@token:decimals(XDAI)",
        expected: "18",
      },
    ],
    docCases: [
      {
        description: "Read the decimals of a token",
        code: `set $decimals @token:decimals(DAI)`,
      },
      {
        description: "Scale an amount manually",
        code: `set $base @num(25 * 10 ^ @token:decimals(DAI))`,
      },
    ],
    sampleArgs: ["DAI"],
  },
  helpers.decimals.argDefs,
);
