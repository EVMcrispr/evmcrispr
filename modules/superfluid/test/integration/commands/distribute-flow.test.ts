import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { RATE_1000_PER_MONTH, SOME_ADDRESS, XDAIX } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function distributeFlow(address token, address from, address pool, int96 requestedFlowRate, bytes userData) returns (bool)",
]);

describeCommand("distribute-flow", {
  describeName:
    "Superfluid > commands > distribute-flow <rate> <token> to <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds a streaming distribution at the requested rate",
      script: `superfluid:distribute-flow 1000e18/mo ${XDAIX} to ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName, args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("distributeFlow");
        expect(args?.[3]).to.eq(RATE_1000_PER_MONTH);
      },
    },
    {
      name: "accepts a 0 rate to stop the distribution flow",
      script: `superfluid:distribute-flow 0 ${XDAIX} to ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(args?.[3]).to.eq(0n);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject negative rates",
      script: `superfluid:distribute-flow -1 ${XDAIX} to ${SOME_ADDRESS}`,
      error: "negative",
    },
  ],
  docCases: [
    {
      description: "Stream 1000 xDAIx a month to all members of a rewards pool",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:distribute-flow 1000e18/mo xDAIx to $rewards`,
    },
  ],
});
