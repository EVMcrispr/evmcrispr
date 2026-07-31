import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { AUTOWRAP_MANAGER, USDC, USDCX } from "../../fixtures";

const managerAbi = parseAbi([
  "function deleteWrapSchedule(address user, address superToken, address liquidityToken)",
]);

describeCommand("stop-auto-wrap", {
  describeName: "Superfluid > commands > stop-auto-wrap <supertoken>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "deletes the connected account's wrap schedule",
      script: `superfluid:stop-auto-wrap ${USDCX}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          AUTOWRAP_MANAGER.toLowerCase(),
        );
        const { functionName, args = [] } = decodeFunctionData({
          abi: managerAbi,
          data: action.data,
        });
        expect(functionName).to.eq("deleteWrapSchedule");
        expect((args[0] as string).toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(USDC.toLowerCase());
      },
    },
  ],
  docCases: [
    {
      description: "Stop auto-wrapping USDCx",
      code: "superfluid:stop-auto-wrap USDCx",
    },
  ],
});
