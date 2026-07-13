import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, USDC, USDCX } from "../../fixtures";

describeHelper("@superfluid:underlying", {
  module: "superfluid",
  cases: [
    {
      name: "returns the underlying ERC-20 of a wrapper SuperToken",
      input: `@superfluid:underlying(${USDCX})`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(USDC.toLowerCase());
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on addresses that are not SuperTokens",
      input: `@superfluid:underlying(${SOME_ADDRESS})`,
      error: "does not look like a SuperToken",
    },
  ],
  docCases: [
    {
      description: "Print the underlying token of USDCx",
      code: `print "Underlying:" @superfluid:underlying(USDCx)`,
    },
  ],
});
