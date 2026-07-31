import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { CFA_FORWARDER, SOME_ADDRESS, XDAIX } from "../../fixtures";

const forwarderAbi = parseAbi([
  "function revokePermissions(address token, address flowOperator) returns (bool)",
]);

describeCommand("revoke-flow-operator", {
  describeName:
    "Superfluid > commands > revoke-flow-operator <token> from <operator>",
  module: "superfluid",
  preamble: "load superfluid",
  cases: [
    {
      name: "revokes the operator's permissions",
      script: `superfluid:revoke-flow-operator ${XDAIX} from ${SOME_ADDRESS}`,
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
        expect(functionName).to.eq("revokePermissions");
        expect((args[1] as string).toLowerCase()).to.eq(
          SOME_ADDRESS.toLowerCase(),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should reject a wrong keyword",
      script: `superfluid:revoke-flow-operator ${XDAIX} to ${SOME_ADDRESS}`,
      error: 'expected keyword "from"',
    },
  ],
  docCases: [
    {
      description: "Revoke an operator's rights over your xDAIx streams",
      code: `superfluid:revoke-flow-operator xDAIx from 0x4F2083f5fBede34C2714aFfb3105539775f7FE64`,
    },
  ],
});
