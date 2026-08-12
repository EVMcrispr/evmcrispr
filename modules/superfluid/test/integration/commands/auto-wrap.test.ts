import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, maxUint256, parseAbi } from "viem";
import {
  AUTOWRAP_MANAGER,
  AUTOWRAP_STRATEGY,
  USDC,
  USDCX,
} from "../../fixtures";

const managerAbi = parseAbi([
  "function createWrapSchedule(address superToken, address strategy, address liquidityToken, uint64 expiry, uint64 lowerLimit, uint64 upperLimit)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

describeCommand("auto-wrap", {
  describeName: "Superfluid > commands > auto-wrap <supertoken>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "approves the strategy (unlimited by default) and creates the wrap schedule",
      script: `superfluid:auto-wrap ${USDCX}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, create] = actions as any[];

        expect((approve.to as string).toLowerCase()).to.eq(USDC.toLowerCase());
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect((approvalArgs[0] as string).toLowerCase()).to.eq(
          AUTOWRAP_STRATEGY.toLowerCase(),
        );
        expect(approvalArgs[1]).to.eq(maxUint256);

        expect((create.to as string).toLowerCase()).to.eq(
          AUTOWRAP_MANAGER.toLowerCase(),
        );
        const { args = [] } = decodeFunctionData({
          abi: managerAbi,
          data: create.data,
        });
        expect((args[1] as string).toLowerCase()).to.eq(
          AUTOWRAP_STRATEGY.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(USDC.toLowerCase());
        expect(args[4]).to.eq(604800n); // 7d lower
        expect(args[5]).to.eq(1209600n); // 14d upper
      },
    },
    {
      name: "caps the allowance with --allowance",
      script: `superfluid:auto-wrap ${USDCX} --allowance 5000e6`,
      validate: (actions) => {
        const { args: approvalArgs = [] } = decodeFunctionData({
          abi: erc20Abi,
          data: (actions[0] as any).data,
        });
        expect(approvalArgs[1]).to.eq(5000n * 10n ** 6n);
      },
    },
    {
      name: "creates and deletes a wrap schedule on a fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:auto-wrap USDCx --lower 3d --upper 8d
  superfluid:stop-auto-wrap USDCx
)`,
      validate: () => {
        // Reaching this point means both manager calls executed on the fork.
      },
    },
  ],
  errorCases: [
    {
      name: "should require --upper above --lower",
      script: `superfluid:auto-wrap ${USDCX} --lower 14d --upper 7d`,
      error: "--upper must be greater than --lower",
    },
  ],
  docCases: [
    {
      description:
        "Keep your USDCx topped up from USDC automatically (wrap when below 7 days of runway, up to 14 days)",
      code: "superfluid:auto-wrap USDCx",
    },
    {
      description: "Cap the strategy's allowance instead of granting unlimited",
      code: "superfluid:auto-wrap USDCx --allowance 5000e6 --lower 3d --upper 8d",
    },
  ],
});
