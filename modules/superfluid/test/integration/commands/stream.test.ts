import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CFA_FORWARDER,
  RATE_1000_PER_MONTH,
  RECEIVER,
  XDAIX,
} from "../../fixtures";

const forwarderAbi = parseAbi([
  "function setFlowrate(address token, address receiver, int96 flowrate) returns (bool)",
]);

/** 2000e18/mo floored independently (not necessarily 2 × the 1000 rate). */
const RATE_2000_PER_MONTH = (2n * 10n ** 21n) / 2592000n;

describeCommand("stream", {
  describeName: "Superfluid > commands > stream <rate> <token> to <receiver>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds an idempotent setFlowrate on the CFA forwarder",
      script: `superfluid:stream 1000e18/mo ${XDAIX} to ${RECEIVER}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          CFA_FORWARDER.toLowerCase(),
        );
        const { functionName, args = [] } = decodeFunctionData({
          abi: forwarderAbi,
          data: action.data,
        });
        expect(functionName).to.eq("setFlowrate");
        expect((args[0] as string).toLowerCase()).to.eq(XDAIX.toLowerCase());
        expect((args[1] as string).toLowerCase()).to.eq(RECEIVER.toLowerCase());
        expect(args[2]).to.eq(RATE_1000_PER_MONTH);
      },
    },
    {
      name: "streams, retargets and stops on a fork, checking flow rates",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:stream 1000e18/mo xDAIx to ${RECEIVER}
  sim:expect @bool(@superfluid:flow(xDAIx @me ${RECEIVER}) == ${RATE_1000_PER_MONTH})
  superfluid:stream 2000e18/mo xDAIx to ${RECEIVER}
  sim:expect @bool(@superfluid:flow(xDAIx @me ${RECEIVER}) == ${RATE_2000_PER_MONTH})
  superfluid:stop-stream xDAIx to ${RECEIVER}
  sim:expect @bool(@superfluid:flow(xDAIx @me ${RECEIVER}) == 0)
  sim:expect @bool(@superfluid:netflow(xDAIx @me) == 0)
)`,
      validate: () => {
        // Reaching this point means wrap, stream, retarget, stop and every
        // flow-rate expectation executed on the fork without reverting.
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a rate that floors to zero",
      script: `superfluid:stream 1/y ${XDAIX} to ${RECEIVER}`,
      error: "greater than zero",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:stream 1000e18/mo ${XDAIX} into ${RECEIVER}`,
      error: 'expected keyword "to"',
    },
  ],
  docCases: [
    {
      description:
        "Stream 1000 xDAIx a month to a contributor on Gnosis (idempotent: re-run with a new rate to change it)",
      code: `superfluid:stream 1000e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71`,
    },
    {
      description:
        "Raise an existing stream as a flow operator on behalf of the sender",
      code: `load superfluid [stream]

stream 500e18/mo xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 --from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64`,
      preamble: "",
    },
  ],
});
