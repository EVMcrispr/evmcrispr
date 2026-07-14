import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { CENTRIFUGE_JTRSY_VAULT, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:claimableRedeem", {
  module: "vault",
  preamble: "switch mainnet",
  cases: [
    {
      name: "returns the claimable redemption request of the connected account",
      input: `@vault:claimableRedeem(${CENTRIFUGE_JTRSY_VAULT})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
    {
      name: "accepts an explicit controller and request id",
      input: `@vault:claimableRedeem(${CENTRIFUGE_JTRSY_VAULT} ${SOME_ADDRESS} 0)`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-7540 vaults",
      input: `@vault:claimableRedeem(${SOME_ADDRESS})`,
      error: "does not look like an ERC-7540 vault",
    },
  ],
  docCases: [
    {
      description:
        "Print the shares ready to be claimed with vault:claim-redeem",
      code: `load vault

switch mainnet
print "claimable:" @vault:claimableRedeem(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)`,
      preamble: "",
    },
  ],
});
