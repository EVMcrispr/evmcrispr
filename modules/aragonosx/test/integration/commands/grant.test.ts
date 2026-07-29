import "../../setup";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { encodeFunctionData } from "viem";
import { ANY_ENTITY } from "../../../src";
import { DAO_ABI } from "../../../src/abis";
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
      script: `aragonosx:grant EXECUTE on dao to ${TEST_ACCOUNT_ADDRESS}\n)`,
      expectedActions: [
        grantAction([
          DAO_ADDRESS,
          TEST_ACCOUNT_ADDRESS,
          permissionId("EXECUTE"),
        ]),
      ],
    },
    {
      name: "grants a permission on a repeated install resolved via @plugin",
      script: `aragonosx:grant UPDATE_MULTISIG_SETTINGS on @aragonosx:plugin(multisig 1) to ${TEST_ACCOUNT_ADDRESS}\n)`,
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
      script: `aragonosx:grant CREATE_PROPOSAL on token-voting to @aragonosx:ANY_ENTITY --condition ${CONDITION}\n)`,
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
      script: `aragonosx:grant ${permissionId("EXECUTE")} on dao to ${TEST_ACCOUNT_ADDRESS}\n)`,
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
      script: `aragonosx:grant EXECUTE on governance to ${TEST_ACCOUNT_ADDRESS}\n)`,
      error: 'plugin "governance" not found',
    },
  ],
  docCases: [
    {
      description: "Allow an address to create token-voting proposals",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose multisig --approve true (
    aragonosx:grant CREATE_PROPOSAL on token-voting to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)`,
    },
  ],
});
