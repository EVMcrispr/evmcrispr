import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, XDAIX } from "../../fixtures";

describeHelper("@superfluid:netflow", {
  module: "superfluid",
  cases: [
    {
      name: "returns 0 for an account with no streams",
      input: `@superfluid:netflow(${XDAIX} ${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  docCases: [
    {
      description:
        "Assert your xDAIx balance is not draining before ending the script",
      code: `print "Net flow:" @superfluid:netflow(xDAIx @me)`,
    },
  ],
});
