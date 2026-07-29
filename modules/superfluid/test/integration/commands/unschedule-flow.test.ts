import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { FLOW_SCHEDULER, RECEIVER, XDAIX } from "../../fixtures";

const schedulerAbi = parseAbi([
  "function deleteFlowSchedule(address superToken, address receiver, bytes ctx)",
]);

describeCommand("unschedule-flow", {
  describeName: "Superfluid > commands > unschedule-flow <token> to <receiver>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "deletes the flow schedule",
      script: `superfluid:unschedule-flow ${XDAIX} to ${RECEIVER}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          FLOW_SCHEDULER.toLowerCase(),
        );
        const { functionName } = decodeFunctionData({
          abi: schedulerAbi,
          data: action.data,
        });
        expect(functionName).to.eq("deleteFlowSchedule");
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a wrong keyword",
      script: `superfluid:unschedule-flow ${XDAIX} for ${RECEIVER}`,
      error: 'expected keyword "to"',
    },
  ],
  docCases: [
    {
      description: "Cancel a pending scheduled stream",
      code: `superfluid:unschedule-flow xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71`,
    },
  ],
});
