import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token",
  {
    cases: [
      {
        input: "@token(DAI)",
        expected: "0x44fA8E6f47987339850636F88629646662444217",
      },
    ],
    sampleArgs: ["DAI"],
  },
  helpers.token.argDefs,
);

describeHelper(
  "@token.balance",
  {
    cases: [
      {
        input: "@token.balance(DAI,@token(DAI))",
        expected: "12100000000000000000",
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)"],
  },
  helpers["token.balance"].argDefs,
);

describeHelper(
  "@token.amount",
  {
    cases: [{ input: "@token.amount(DAI, 1)", expected: String(1e18) }],
    sampleArgs: ["DAI", "1"],
  },
  helpers["token.amount"].argDefs,
);
