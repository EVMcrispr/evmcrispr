import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { maxUint256 } from "viem";
import { SOME_ADDRESS } from "../../fixtures";

describeHelper("@lending:healthFactor", {
  module: "lending",
  cases: [
    {
      name: "returns uint256.max for a debt-free account",
      input: `@lending:healthFactor(${SOME_ADDRESS})`,
      expected: maxUint256.toString(),
    },
    {
      name: "accepts an explicit adapter",
      input: `@lending:healthFactor(${SOME_ADDRESS} AaveV3)`,
      expected: maxUint256.toString(),
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
      description:
        "Print the health factor (1e18-scaled; below 1e18 is liquidatable)",
      code: 'print "Health factor:" @lending:healthFactor(@me)',
    },
  ],
});
