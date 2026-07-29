import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  FLOW_SCHEDULER,
  RATE_1000_PER_MONTH,
  RECEIVER,
  XDAIX,
} from "../../fixtures";

const schedulerAbi = parseAbi([
  "function createFlowSchedule(address superToken, address receiver, uint32 startDate, uint32 startMaxDelay, int96 flowRate, uint256 startAmount, uint32 endDate, bytes userData, bytes ctx)",
]);
const forwarderAbi = parseAbi([
  "function updateFlowOperatorPermissions(address token, address flowOperator, uint8 permissions, int96 flowrateAllowance) returns (bool)",
]);

// Fixed future timestamps (2033) — safely past the pinned fork block's time.
const START = 2000000000;
const END = START + 30 * 86400;

describeCommand("schedule-flow", {
  describeName:
    "Superfluid > commands > schedule-flow <rate> <token> to <receiver>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "grants create+delete to the scheduler and creates a start+end schedule",
      script: `superfluid:schedule-flow 1000e18/mo ${XDAIX} to ${RECEIVER} --start ${START} --end ${END}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [grant, create] = actions as any[];

        const grantDecoded = decodeFunctionData({
          abi: forwarderAbi,
          data: grant.data,
        });
        expect((grantDecoded.args?.[1] as string).toLowerCase()).to.eq(
          FLOW_SCHEDULER.toLowerCase(),
        );
        expect(grantDecoded.args?.[2]).to.eq(5); // CREATE(1) | DELETE(4)
        expect(grantDecoded.args?.[3]).to.eq(RATE_1000_PER_MONTH);

        expect((create.to as string).toLowerCase()).to.eq(
          FLOW_SCHEDULER.toLowerCase(),
        );
        const { args } = decodeFunctionData({
          abi: schedulerAbi,
          data: create.data,
        });
        expect(args?.[2]).to.eq(START);
        expect(args?.[4]).to.eq(RATE_1000_PER_MONTH);
        expect(args?.[6]).to.eq(END);
      },
    },
    {
      name: "grants only delete for an end-only schedule with rate 0",
      script: `superfluid:schedule-flow 0 ${XDAIX} to ${RECEIVER} --end ${END}`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const grantDecoded = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(grantDecoded.args?.[2]).to.eq(4); // DELETE only
      },
    },
    {
      name: "schedules and unschedules on a fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:schedule-flow 1000e18/mo xDAIx to ${RECEIVER} --start ${START} --end ${END}
  superfluid:unschedule-flow xDAIx to ${RECEIVER}
)`,
      validate: () => {
        // Reaching this point means the grant, schedule and unschedule all
        // executed on the fork.
      },
    },
  ],
  errorCases: [
    {
      name: "should require --start or --end",
      script: `superfluid:schedule-flow 1000e18/mo ${XDAIX} to ${RECEIVER}`,
      error: "at least one of --start or --end",
    },
    {
      name: "should reject --start-amount without --start",
      script: `superfluid:schedule-flow 1000e18/mo ${XDAIX} to ${RECEIVER} --end ${END} --start-amount 100e18`,
      error: "--start-amount requires --start",
    },
    {
      name: "should reject a zero rate for a start schedule",
      script: `superfluid:schedule-flow 0 ${XDAIX} to ${RECEIVER} --start ${START}`,
      error: "greater than zero",
    },
  ],
  docCases: [
    {
      description:
        "Schedule a salary stream to open on Jan 1st 2034 and close a year later, run by Superfluid keepers",
      code: `superfluid:schedule-flow 1000e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --start 2019686400 --end 2051222400`,
    },
  ],
});
