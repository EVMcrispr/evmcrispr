import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { DAO_ABI } from "../../../src/abis";
import { permissionId } from "../../../src/utils/permissions";
import { DAO_ADDRESS, PREAMBLE, TOKEN_VOTING_PLUGIN } from "../../fixtures";

describeCommand("revoke", {
  module: "aragonosx",
  preamble: PREAMBLE,
  cases: [
    {
      name: "revokes a permission on a plugin",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:revoke EXECUTE_PROPOSAL on token-voting from ${TEST_ACCOUNT_ADDRESS}
)`,
      expectedActions: [
        {
          to: DAO_ADDRESS,
          data: encodeFunctionData({
            abi: DAO_ABI,
            functionName: "revoke",
            args: [
              TOKEN_VOTING_PLUGIN,
              TEST_ACCOUNT_ADDRESS,
              permissionId("EXECUTE_PROPOSAL"),
            ],
          }),
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "fails outside a connect block",
      script: `aragonosx:revoke EXECUTE on dao from ${TEST_ACCOUNT_ADDRESS}`,
      error: 'used within a "connect" command',
    },
  ],
  docCases: [
    {
      description: "Remove an account's permission to execute DAO actions",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting (
    aragonosx:revoke EXECUTE on dao from 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)`,
    },
  ],
});
