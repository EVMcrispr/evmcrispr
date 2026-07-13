import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SDAI, SOME_ADDRESS, WXDAI } from "../../fixtures";

describeHelper("@vault:asset", {
  module: "vault",
  cases: [
    {
      name: "returns the underlying asset of the vault",
      input: `@vault:asset(${SDAI})`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(WXDAI.toLowerCase());
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-4626 vaults",
      input: `@vault:asset(${SOME_ADDRESS})`,
      error: "does not look like an ERC-4626 vault",
    },
  ],
  docCases: [
    {
      description: "Print the underlying asset of the sDAI vault",
      code: 'print "sDAI asset:" @vault:asset(0xaf204776c7245bF4147c2612BF6e5972Ee483701)',
    },
  ],
});
