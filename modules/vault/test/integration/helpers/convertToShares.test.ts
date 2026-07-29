import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SDAI, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:convertToShares", {
  module: "vault",
  cases: [
    {
      name: "values one WXDAI below one sDAI share (accrued yield)",
      input: `@vault:convertToShares(${SDAI} 1e18)`,
      validate: (result) => {
        const shares = BigInt(result);
        expect(shares > 0n).to.be.true;
        expect(shares < 10n ** 18n).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      input: `@vault:convertToShares(${SOME_ADDRESS} 1e18)`,
      error: "does not look like an ERC-4626 vault",
    },
  ],
  docCases: [
    {
      description: "Print how many sDAI shares 100 WXDAI buys",
      code: 'print "Shares:" @vault:convertToShares(0xaf204776c7245bF4147c2612BF6e5972Ee483701 100e18)',
    },
  ],
});
