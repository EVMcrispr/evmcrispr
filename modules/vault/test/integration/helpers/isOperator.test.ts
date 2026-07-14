import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { CENTRIFUGE_JTRSY_VAULT, SOME_ADDRESS } from "../../fixtures";

describeHelper("@vault:isOperator", {
  module: "vault",
  preamble: "switch mainnet",
  cases: [
    {
      name: "returns false for an account that was never approved",
      input: `@vault:isOperator(${CENTRIFUGE_JTRSY_VAULT} ${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("false");
      },
    },
    {
      name: "accepts an explicit controller",
      input: `@vault:isOperator(${CENTRIFUGE_JTRSY_VAULT} ${SOME_ADDRESS} ${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("false");
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not ERC-7540 vaults",
      input: `@vault:isOperator(${SOME_ADDRESS} ${SOME_ADDRESS})`,
      error: "does not look like an ERC-7540 vault",
    },
  ],
  docCases: [
    {
      description:
        "Check whether an account can request and claim on your behalf",
      code: `load vault

switch mainnet
print "operator:" @vault:isOperator(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)`,
      preamble: "",
    },
  ],
});
