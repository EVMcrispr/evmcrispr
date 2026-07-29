import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SDAI, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:totalAssets", {
  module: "vault",
  cases: [
    {
      name: "reports a nonzero TVL for the sDAI vault",
      input: `@vault:totalAssets(${SDAI})`,
      validate: (result) => {
        expect(BigInt(result) > 0n).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      input: `@vault:totalAssets(${SOME_ADDRESS})`,
      error: "does not look like an ERC-4626 vault",
    },
  ],
  docCases: [
    {
      description: "Print the total WXDAI managed by the sDAI vault",
      code: 'print "sDAI TVL:" @vault:totalAssets(0xaf204776c7245bF4147c2612BF6e5972Ee483701)',
    },
  ],
});
