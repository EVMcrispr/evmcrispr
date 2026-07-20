import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS } from "../../fixtures";

describeHelper("@giveth:claimable", {
  module: "giveth",
  cases: [
    {
      name: "returns 0 for an account without a GIVstream allocation",
      input: `@giveth:claimable(${SOME_ADDRESS})`,
      validate: (result) => {
        expect(String(result)).to.eq("0");
      },
    },
  ],
  docCases: [
    {
      description: "Print the GIV your GIVstream has already released",
      code: 'print "Claimable GIV:" @giveth:claimable()',
    },
  ],
});
