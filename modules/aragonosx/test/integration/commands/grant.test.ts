import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { DAO_ABI } from "../../../src/abis";
import { ANY_ENTITY } from "../../../src";
import { permissionId } from "../../../src/utils/permissions";
import {
  DAO_ADDRESS,
  MULTISIG_PLUGIN_2,
  PREAMBLE,
  TOKEN_VOTING_PLUGIN,
} from "../../fixtures";

const CONDITION = "0x00000000000000000000000000000000000000c1";

const grantAction = (args: readonly [any, any, any]) => ({
  to: DAO_ADDRESS,
  data: encodeFunctionData({ abi: DAO_ABI, functionName: "grant", args }),
});

describeCommand("grant", {
  module: "aragonosx",
  preamble: `${PREAMBLE}\naragonosx:connect ${DAO_ADDRESS} (`,
  cases: [
    {
      name: "grants a permission on the DAO itself",
      script: `aragonosx:grant ${TEST_ACCOUNT_ADDRESS} dao EXECUTE\n)`,
      expectedActions: [
        grantAction([
          DAO_ADDRESS,
          TEST_ACCOUNT_ADDRESS,
          permissionId("EXECUTE"),
        ]),
      ],
    },
    {
      name: "grants a permission on an indexed plugin identifier",
      script: `aragonosx:grant ${TEST_ACCOUNT_ADDRESS} multisig:1 UPDATE_MULTISIG_SETTINGS\n)`,
      expectedActions: [
        grantAction([
          MULTISIG_PLUGIN_2,
          TEST_ACCOUNT_ADDRESS,
          permissionId("UPDATE_MULTISIG_SETTINGS"),
        ]),
      ],
    },
    {
      name: "grants to ANY_ENTITY with a condition contract",
      script: `aragonosx:grant @aragonosx:ANY_ENTITY token-voting CREATE_PROPOSAL --condition ${CONDITION}\n)`,
      expectedActions: [
        {
          to: DAO_ADDRESS,
          data: encodeFunctionData({
            abi: DAO_ABI,
            functionName: "grantWithCondition",
            args: [
              TOKEN_VOTING_PLUGIN,
              ANY_ENTITY,
              permissionId("CREATE_PROPOSAL"),
              CONDITION,
            ],
          }),
        },
      ],
    },
    {
      name: "accepts a raw bytes32 permission id",
      script: `aragonosx:grant ${TEST_ACCOUNT_ADDRESS} dao ${permissionId("EXECUTE")}\n)`,
      expectedActions: [
        grantAction([
          DAO_ADDRESS,
          TEST_ACCOUNT_ADDRESS,
          permissionId("EXECUTE"),
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "fails on an unknown plugin",
      script: `aragonosx:grant ${TEST_ACCOUNT_ADDRESS} governance EXECUTE\n)`,
      error: 'plugin "governance" not found',
    },
  ],
  docCases: [
    {
      description: "Allow an address to create token-voting proposals",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose multisig --approve true (
    aragonosx:grant 0xc125218F4Df091eE40624784caF7F47B9738086f token-voting CREATE_PROPOSAL
  )
)`,
    },
  ],
});
