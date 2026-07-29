import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
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
    docCases: [
      {
        description: "Get own address",
        code: `print @me`,
      },
      {
        description: "Check own token balance",
        code: `set $balance @get(@token(DAI) "balanceOf(address)(uint256)" @me)\nprint $balance`,
      },
      {
        description: "Use in exec",
        code: `exec @token(DAI) "approve(address,uint256)" @me 100e18`,
      },
    ],
  },
  helpers.me.argDefs,
);
