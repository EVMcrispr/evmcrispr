import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@sender",
  {
    cases: [
      {
        name: "is the connected account at the top level",
        input: "@sender",
        expected: TEST_ACCOUNT_ADDRESS,
      },
    ],
    docCases: [
      {
        description:
          "Approve the account the calls come from: your wallet here, the Safe inside safe:propose",
        code: `exec @token(DAI) "approve(address,uint256)" @sender 100e18`,
      },
    ],
  },
  helpers.sender.argDefs,
);
