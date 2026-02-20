import "../../setup";
import { describeHelper, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@me",
  {
    cases: [
      {
        name: "should return the current connected account",
        input: "@me",
        expected: TEST_ACCOUNT_ADDRESS,
      },
    ],
  },
  helpers.me.argDefs,
);
