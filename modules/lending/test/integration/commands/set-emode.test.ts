import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { AAVE_POOL } from "../../fixtures";

const poolAbi = parseAbi(["function setUserEMode(uint8 categoryId)"]);

describeCommand("set-emode", {
  describeName: "Lending > commands > set-emode <categoryId>",
  module: "lending",
  preamble: "load lending",
  cases: [
    {
      name: "encodes the e-mode category",
      script: "lending:set-emode 1",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect(action.to).to.eq(AAVE_POOL);
        const { functionName, args } = decodeFunctionData({
          abi: poolAbi,
          data: action.data,
        });
        expect(functionName).to.eq("setUserEMode");
        expect(args).to.eql([1]);
      },
    },
    {
      name: "executes a no-op category 0 inside sim:fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 1e18
  lending:set-emode 0
)`,
      validate: () => {
        // Reaching this point means setUserEMode executed on the fork.
      },
    },
  ],
  errorCases: [
    {
      name: "should reject categories above 255",
      script: "lending:set-emode 300",
      error: "between 0 and 255",
    },
  ],
  docCases: [
    {
      description:
        "Enter e-mode category 1 to unlock higher LTV between correlated assets",
      code: "lending:set-emode 1",
    },
    {
      description: "Leave e-mode",
      code: "lending:set-emode 0",
    },
  ],
});
