import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { RECEIVER, VESTING_SCHEDULER_V3, XDAIX } from "../../fixtures";

const schedulerAbi = parseAbi([
  "function createVestingScheduleFromAmountAndDuration(address superToken, address receiver, uint256 totalAmount, uint32 totalDuration, uint32 startDate, uint32 cliffPeriod, uint32 claimPeriod)",
]);
const YEAR = 31536000n;

describeCommand("vest", {
  describeName:
    "Superfluid > commands > vest <amount> <token> to <receiver> over <duration>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "grants the scheduler, approves the allowance and creates the schedule",
      script: `superfluid:vest 12000e18 ${XDAIX} to ${RECEIVER} over 1y --cliff 90d`,
      validate: (actions) => {
        // operator grant + SuperToken approve + createVestingSchedule…
        expect(actions).to.have.length(3);
        const create = actions.at(-1) as any;
        expect((create.to as string).toLowerCase()).to.eq(
          VESTING_SCHEDULER_V3.toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: schedulerAbi,
          data: create.data,
        });
        expect(functionName).to.eq(
          "createVestingScheduleFromAmountAndDuration",
        );
        expect(args?.[2]).to.eq(12000n * 10n ** 18n);
        expect(args?.[3]).to.eq(Number(YEAR));
        expect(args?.[5]).to.eq(90 * 86400);
      },
    },
    {
      name: "skips the grant and approval with --no-approve true",
      script: `superfluid:vest 12000e18 ${XDAIX} to ${RECEIVER} over 1y --no-approve true`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "creates a vesting schedule on a fork with a sufficient allowance",
      script: `load sim
set $alice ${RECEIVER}
set $vesting ${VESTING_SCHEDULER_V3}
sim:fork --using anvil (
  sim:set-balance @me 30000e18
  superfluid:wrap 15000e18 into xDAIx
  superfluid:vest 12000e18 xDAIx to $alice over 1y --cliff 90d
  sim:expect @bool(@get($vesting "getMaximumNeededTokenAllowance(address,address,address)(uint256)" ${XDAIX} @me $alice) <= @get(${XDAIX} "allowance(address,address)(uint256)" @me $vesting))
  superfluid:stop-vesting xDAIx to $alice
)`,
      validate: () => {
        // Reaching this point means the auto-granted allowance covered
        // getMaximumNeededTokenAllowance and the schedule round-tripped.
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a cliff longer than the duration",
      script: `superfluid:vest 12000e18 ${XDAIX} to ${RECEIVER} over 90d --cliff 1y`,
      error: "shorter than the total duration",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:vest 12000e18 ${XDAIX} to ${RECEIVER} during 1y`,
      error: 'expected keyword "over"',
    },
  ],
  docCases: [
    {
      description:
        "Vest 12,000 xDAIx to a contributor over a year with a 3-month cliff (scheduler permissions and allowance are granted automatically)",
      code: `superfluid:vest 12000e18 xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 over 1y --cliff 90d`,
    },
  ],
});
