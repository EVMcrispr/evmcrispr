import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { CENTRIFUGE_JTRSY_VAULT, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:pendingRedeem", {
  module: "vault",
  preamble: "switch mainnet",
  cases: [
    {
      name: "returns the pending redemption request of the connected account",
      input: `@vault:pendingRedeem(${CENTRIFUGE_JTRSY_VAULT})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
    {
      name: "accepts an explicit controller and request id",
      input: `@vault:pendingRedeem(${CENTRIFUGE_JTRSY_VAULT} ${SOME_ADDRESS} 0)`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-7540 vaults",
      input: `@vault:pendingRedeem(${SOME_ADDRESS})`,
      error: "does not look like an ERC-7540 vault",
    },
  ],
  docCases: [
    {
      description:
        "Print the shares waiting for fulfillment on the Centrifuge JTRSY vault",
      code: `load vault

switch mainnet
print "pending:" @vault:pendingRedeem(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)`,
      preamble: "",
    },
  ],
});
