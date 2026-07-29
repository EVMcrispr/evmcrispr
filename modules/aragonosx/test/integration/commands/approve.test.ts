import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { MULTISIG_ABI } from "../../../src/plugins/multisig";
import { DAO_ADDRESS, MULTISIG_PLUGIN, PREAMBLE } from "../../fixtures";

describeCommand("approve", {
  module: "aragonosx",
  preamble: `${PREAMBLE}\naragonosx:connect ${DAO_ADDRESS} (`,
  cases: [
    {
      name: "approves a multisig proposal with execution",
      script: `aragonosx:approve multisig 5 --try-execution true\n)`,
      expectedActions: [
        {
          to: MULTISIG_PLUGIN,
          data: encodeFunctionData({
            abi: MULTISIG_ABI,
            functionName: "approve",
            args: [5n, true],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "rejects approving a token-voting proposal",
      script: `aragonosx:approve token-voting 5\n)`,
      error: "doesn't support approvals",
    },
  ],
  docCases: [
    {
      description:
        "Approve a pending multisig proposal and execute it if it passes",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:approve multisig 5 --try-execution true
)`,
    },
  ],
});
