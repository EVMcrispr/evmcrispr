import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS } from "../../fixtures";

describeHelper("@lending:healthFactor", {
  module: "lending",
  cases: [
    {
      name: "reads as effectively unbounded for a debt-free account",
      input: `@lending:healthFactor(${SOME_ADDRESS})`,
      validate: (result) => {
        // The protocol's no-debt sentinel is uint256.max, which as the
        // ratio it stands for is astronomically above any real position.
        expect(Number(result)).to.be.greaterThan(1e50);
      },
    },
    {
      name: "accepts an explicit adapter",
      input: `@lending:healthFactor(${SOME_ADDRESS} AaveV3)`,
      validate: (result) => {
        expect(Number(result)).to.be.greaterThan(1e50);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on unknown adapters",
      input: `@lending:healthFactor(${SOME_ADDRESS} Compound)`,
      error: "must be one of AaveV3",
    },
  ],
  docCases: [
    {
      description: "Print the health factor (below 1 is liquidatable)",
      code: 'print "Health factor:" @lending:healthFactor(@me)',
    },
  ],
});
