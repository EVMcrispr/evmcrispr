import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  CFA_FORWARDER,
  RATE_1000_PER_MONTH,
  SOME_ADDRESS,
  XDAIX,
} from "../../fixtures";

const forwarderAbi = parseAbi([
  "function grantPermissions(address token, address flowOperator) returns (bool)",
  "function updateFlowOperatorPermissions(address token, address flowOperator, uint8 permissions, int96 flowrateAllowance) returns (bool)",
]);

describeCommand("grant-flow-operator", {
  describeName:
    "Superfluid > commands > grant-flow-operator <token> to <operator>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "grants full control with unlimited allowance by default",
      script: `superfluid:grant-flow-operator ${XDAIX} to ${SOME_ADDRESS}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const action = actions[0] as any;
        expect((action.to as string).toLowerCase()).to.eq(
          CFA_FORWARDER.toLowerCase(),
        );
        const { functionName } = decodeFunctionData({
          abi: forwarderAbi,
          data: action.data,
        });
        expect(functionName).to.eq("grantPermissions");
      },
    },
    {
      name: "restricts permissions and allowance when asked",
      script: `superfluid:grant-flow-operator ${XDAIX} to ${SOME_ADDRESS} --permissions "create,delete" --allowance 1000e18/mo`,
      validate: (actions) => {
        const { functionName, args } = decodeFunctionData({
          abi: forwarderAbi,
          data: (actions[0] as any).data,
        });
        expect(functionName).to.eq("updateFlowOperatorPermissions");
        expect(args?.[2]).to.eq(5); // CREATE(1) | DELETE(4)
        expect(args?.[3]).to.eq(RATE_1000_PER_MONTH);
      },
    },
    {
      name: "grants, uses and revokes operator rights on a fork",
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:grant-flow-operator xDAIx to ${SOME_ADDRESS}
  superfluid:revoke-flow-operator xDAIx from ${SOME_ADDRESS}
)`,
      validate: () => {
        // Reaching this point means grant and revoke executed on the fork.
      },
    },
  ],
  errorCases: [
    {
      name: "should reject unknown permission names",
      script: `superfluid:grant-flow-operator ${XDAIX} to ${SOME_ADDRESS} --permissions admin`,
      error: "unknown permission",
    },
    {
      name: "should reject a wrong keyword",
      script: `superfluid:grant-flow-operator ${XDAIX} from ${SOME_ADDRESS}`,
      error: 'expected keyword "to"',
    },
  ],
  docCases: [
    {
      description:
        "Let a manager contract open and close xDAIx streams on your behalf, capped at 5000 xDAIx a month",
      code: `superfluid:grant-flow-operator xDAIx to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 --permissions "create,delete" --allowance 5000e18/mo`,
    },
  ],
});
