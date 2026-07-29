import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GDA_FORWARDER, RECEIVER, SOME_ADDRESS } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function updateMemberUnits(address pool, address member, uint128 units, bytes userData) returns (bool)",
]);

describeCommand("set-units", {
  describeName:
    "Superfluid > commands > set-units <units> to <member> in <pool>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "builds an updateMemberUnits action",
      script: `superfluid:set-units 5 to ${RECEIVER} in ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          GDA_FORWARDER.toLowerCase(),
        );
        const { functionName, args } = decodeFunctionData({
          abi: forwarderAbi,
          data: action.data,
        });
        expect(functionName).to.eq("updateMemberUnits");
        expect((args?.[0] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
        expect((args?.[1] as string).toLowerCase()).to.eq(
          RECEIVER.toLowerCase(),
        );
        expect(args?.[2]).to.eq(5n);
      },
    },
    {
      name: "allows 0 units to remove a member",
      script: `superfluid:set-units 0 to ${RECEIVER} in ${SOME_ADDRESS}`,
      validate: (actions) => {
        const { args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(args?.[2]).to.eq(0n);
      },
    },
  ],
  errorCases: [
    {
      name: "should reject negative units",
      script: `superfluid:set-units -1 to ${RECEIVER} in ${SOME_ADDRESS}`,
      error: "uint128",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:set-units 5 to ${RECEIVER} of ${SOME_ADDRESS}`,
      error: 'expected keyword "in"',
    },
  ],
  docCases: [
    {
      description:
        "Give a contributor 5 units in a freshly created rewards pool",
      code: `superfluid:create-pool $rewards xDAIx
superfluid:set-units 5 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards`,
    },
  ],
});
