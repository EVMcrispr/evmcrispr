import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, XDAIX } from "../../fixtures";

describeHelper("@superfluid:balance", {
  module: "superfluid",
  cases: [
    {
      name: "returns 0 for an account with no SuperTokens",
      input: `@superfluid:balance(${XDAIX} ${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  docCases: [
    {
      description:
        "Print your real-time xDAIx balance (streaming balance minus buffers)",
      code: `print "Balance:" @superfluid:balance(xDAIx)`,
    },
  ],
});
