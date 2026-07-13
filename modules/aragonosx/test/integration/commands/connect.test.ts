import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { BindingsSpace } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import { DAO_ABI } from "../../../src/abis";
import { permissionId } from "../../../src/utils/permissions";
import {
  DAO_ADDRESS,
  DAO_SUBDOMAIN,
  PREAMBLE,
  TOKEN_VOTING_PLUGIN,
} from "../../fixtures";

const GRANT_ACTION = {
  to: DAO_ADDRESS,
  data: encodeFunctionData({
    abi: DAO_ABI,
    functionName: "grant",
    args: [TOKEN_VOTING_PLUGIN, TEST_ACCOUNT_ADDRESS, permissionId("EXECUTE")],
  }),
};

describeCommand("connect", {
  module: "aragonosx",
  preamble: PREAMBLE,
  cases: [
    {
      name: "connects to a DAO by address and returns the block actions",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:grant ${TEST_ACCOUNT_ADDRESS} token-voting EXECUTE
)`,
      expectedActions: [GRANT_ACTION],
    },
    {
      name: "connects to a DAO by its ENS subdomain",
      script: `aragonosx:connect ${DAO_SUBDOMAIN} (
  aragonosx:grant ${TEST_ACCOUNT_ADDRESS} token-voting EXECUTE
)`,
      expectedActions: [GRANT_ACTION],
    },
    {
      name: "resolves plugins cross-DAO with the _dao: prefix",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  set $plugin @aragonosx:plugin("_${DAO_SUBDOMAIN}:token-voting")
)`,
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$plugin", BindingsSpace.USER),
        ).to.equal(TOKEN_VOTING_PLUGIN);
      },
    },
  ],
  errorCases: [
    {
      name: "fails when reconnecting to the same DAO",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:connect ${DAO_ADDRESS} (
    aragonosx:grant ${TEST_ACCOUNT_ADDRESS} token-voting EXECUTE
  )
)`,
      error: "already connected",
    },
    {
      name: "fails on an unknown DAO name",
      script: `aragonosx:connect not-a-dao (
  aragonosx:grant ${TEST_ACCOUNT_ADDRESS} token-voting EXECUTE
)`,
      error: "couldn't be resolved",
    },
  ],
  docCases: [
    {
      description:
        "Connect to a DAO and grant a permission through its token-voting plugin",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting --metadata "ipfs://QmMetadata" (
    aragonosx:grant 0xc125218F4Df091eE40624784caF7F47B9738086f token-voting EXECUTE
  )
)`,
    },
  ],
});
