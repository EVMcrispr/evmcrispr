import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";

describeCommand("renounce", {
  describeName: "AccessControl > commands > renounce <role> on <target>",
  module: "acl",
  preamble: "load acl",
  cases: [
    {
      name: "should renounce an AccessControl role with the connected account as confirmation",
      script: `acl:renounce DISTRIBUTOR_ROLE on ${TOKEN_DISTRO}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "renounceRole(bytes32,address)", [
          keccak256(toHex("DISTRIBUTOR_ROLE")),
          TEST_ACCOUNT_ADDRESS,
        ]),
      ],
    },
    {
      name: "should renounce an AccessManager role with the connected account as confirmation",
      script: `acl:renounce 42 on ${MANAGER}`,
      expectedActions: [
        encodeAction(MANAGER, "renounceRole(uint64,address)", [
          Num(42n),
          TEST_ACCOUNT_ADDRESS,
        ]),
      ],
    },
  ],
});
