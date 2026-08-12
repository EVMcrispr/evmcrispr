import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { CFA_FORWARDER, RECEIVER, SOME_ADDRESS, XDAIX } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function setFlowrate(address token, address receiver, int96 flowrate) returns (bool)",
  "function deleteFlow(address token, address sender, address receiver, bytes userData) returns (bool)",
]);

describeCommand("stop-stream", {
  describeName: "Superfluid > commands > stop-stream <token> to <receiver>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "stops an outgoing stream via setFlowrate(0)",
      script: `superfluid:stop-stream ${XDAIX} to ${RECEIVER}`,
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
        expect(args[2]).to.eq(0n);
      },
    },
    {
      name: "deletes another sender's stream with --from",
      script: `superfluid:stop-stream ${XDAIX} to ${RECEIVER} --from ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const { functionName, args = [] } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("deleteFlow");
        expect((args[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args[2] as string).toLowerCase()).to.eq(RECEIVER.toLowerCase());
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a wrong keyword",
      script: `superfluid:stop-stream ${XDAIX} from ${RECEIVER}`,
      error: 'expected keyword "to"',
    },
  ],
  docCases: [
    {
      description: "Stop your stream to a receiver (buffer is refunded)",
      code: `superfluid:stop-stream xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71`,
    },
  ],
});
