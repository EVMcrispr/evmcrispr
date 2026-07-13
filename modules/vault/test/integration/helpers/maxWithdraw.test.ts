import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SDAI, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:maxWithdraw", {
  module: "vault",
  cases: [
    {
      name: "returns 0 for an account without shares",
      input: `@vault:maxWithdraw(${SDAI} ${SOME_ADDRESS})`,
      expected: "0",
    },
    {
      name: "defaults to the connected account",
      input: `@vault:maxWithdraw(${SDAI})`,
      expected: "0",
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      input: `@vault:maxWithdraw(${SOME_ADDRESS} ${SOME_ADDRESS})`,
      error: "does not look like an ERC-4626 vault",
    },
  ],
  docCases: [
    {
      description: "Print how much WXDAI the connected account can withdraw",
      code: 'print "Withdrawable:" @vault:maxWithdraw(0xaf204776c7245bF4147c2612BF6e5972Ee483701 @me)',
    },
  ],
});
