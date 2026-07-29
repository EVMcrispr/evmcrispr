import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SDAI, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:convertToAssets", {
  module: "vault",
  cases: [
    {
      name: "values one sDAI share above one WXDAI (accrued yield)",
      input: `@vault:convertToAssets(${SDAI} 1e18)`,
      validate: (result) => {
        expect(BigInt(result) > 10n ** 18n).to.be.true;
      },
    },
    {
      name: "converts zero shares to zero assets",
      input: `@vault:convertToAssets(${SDAI} 0)`,
      expected: "0",
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      input: `@vault:convertToAssets(${SOME_ADDRESS} 1e18)`,
      error: "does not look like an ERC-4626 vault",
    },
  ],
  docCases: [
    {
      description: "Print the WXDAI value of one sDAI share",
      code: 'print "Share price:" @vault:convertToAssets(0xaf204776c7245bF4147c2612BF6e5972Ee483701 1e18)',
    },
  ],
});
