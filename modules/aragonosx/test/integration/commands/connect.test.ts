import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
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
  aragonosx:grant EXECUTE on token-voting to ${TEST_ACCOUNT_ADDRESS}
)`,
      expectedActions: [GRANT_ACTION],
    },
    {
      name: "connects to a DAO by its ENS subdomain",
      script: `aragonosx:connect ${DAO_SUBDOMAIN} (
  aragonosx:grant EXECUTE on token-voting to ${TEST_ACCOUNT_ADDRESS}
)`,
      expectedActions: [GRANT_ACTION],
    },
    {
      name: "shares values between sequential connect blocks via set",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  set $plugin @aragonosx:plugin("token-voting")
)
aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:grant EXECUTE on $plugin to ${TEST_ACCOUNT_ADDRESS}
)`,
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$plugin", BindingsSpace.USER)).to.equal(
          TOKEN_VOTING_PLUGIN,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "fails when nesting connect commands",
      script: `aragonosx:connect ${DAO_ADDRESS} (
  aragonosx:connect ${DAO_ADDRESS} (
    aragonosx:grant EXECUTE on token-voting to ${TEST_ACCOUNT_ADDRESS}
  )
)`,
      error: 'nested "connect" commands are not supported',
    },
    {
      name: "fails on an unknown DAO name",
      script: `aragonosx:connect not-a-dao (
  aragonosx:grant EXECUTE on token-voting to ${TEST_ACCOUNT_ADDRESS}
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
    aragonosx:grant EXECUTE on token-voting to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)`,
    },
  ],
});
