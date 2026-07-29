import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import {
  CENTRIFUGE_JTRSY_VAULT,
  JTRSY_SHARE,
  STEAKHOUSE_USDC,
} from "../../fixtures";

describeHelper("@vault:share", {
  module: "vault",
  preamble: "switch mainnet",
  cases: [
    {
      name: "returns the external share token of an ERC-7575 vault",
      input: `@vault:share(${CENTRIFUGE_JTRSY_VAULT})`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(JTRSY_SHARE.toLowerCase());
      },
    },
    {
      name: "falls back to the vault itself for plain ERC-4626 vaults",
      input: `@vault:share(${STEAKHOUSE_USDC})`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(
          STEAKHOUSE_USDC.toLowerCase(),
        );
      },
    },
  ],
  docCases: [
    {
      description:
        "Print the external share token of the Centrifuge JTRSY vault (ERC-7575)",
      code: `load vault

switch mainnet
print "share:" @vault:share(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)`,
      preamble: "",
    },
    {
      description:
        "Plain ERC-4626 vaults are their own share token, so the vault address is returned",
      code: 'print "share:" @vault:share(0xaf204776c7245bF4147c2612BF6e5972Ee483701)',
    },
  ],
});
