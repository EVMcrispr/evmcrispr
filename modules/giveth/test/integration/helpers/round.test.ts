import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";

describeHelper("@giveth:round", {
  module: "giveth",
  cases: [
    {
      name: "returns the current GIVpower round",
      input: "@giveth:round()",
      validate: (result) => {
        expect(BigInt(String(result)) > 0n).to.be.true;
      },
    },
  ],
  docCases: [
    {
      description: "Print the current GIVpower round",
      code: 'print "Current round:" @giveth:round()',
    },
  ],
});
