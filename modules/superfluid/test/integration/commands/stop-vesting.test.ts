import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { RECEIVER, VESTING_SCHEDULER_V3, XDAIX } from "../../fixtures";

const schedulerAbi = parseAbi([
  "function deleteVestingSchedule(address superToken, address receiver)",
  "function endVestingScheduleNow(address superToken, address receiver)",
]);

describeCommand("stop-vesting", {
  describeName: "Superfluid > commands > stop-vesting <token> to <receiver>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "deletes a pending schedule by default",
      script: `superfluid:stop-vesting ${XDAIX} to ${RECEIVER}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          VESTING_SCHEDULER_V3.toLowerCase(),
        );
        const { functionName } = decodeFunctionData({
          abi: schedulerAbi,
          data: action.data,
        });
        expect(functionName).to.eq("deleteVestingSchedule");
      },
    },
    {
      name: "ends a running schedule immediately with --now true",
      script: `superfluid:stop-vesting ${XDAIX} to ${RECEIVER} --now true`,
      validate: (actions) => {
        const { functionName } = decodeFunctionData({
          abi: schedulerAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("endVestingScheduleNow");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a wrong keyword",
      script: `superfluid:stop-vesting ${XDAIX} for ${RECEIVER}`,
      error: 'expected keyword "to"',
    },
  ],
  docCases: [
    {
      description: "Cancel a contributor's vesting before it starts",
      code: `superfluid:stop-vesting xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71`,
    },
  ],
});
