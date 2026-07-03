import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MANAGER = "0x1111111111111111111111111111111111111111";

describeCommand("revoke", {
  describeName: "AccessControl > commands > revoke <target> <role> <account>",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should encode an AccessControl revokeRole for string roles",
      script: `access-control:revoke ${TOKEN_DISTRO} DISTRIBUTOR_ROLE ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "revokeRole(bytes32,address)", [
          keccak256(toHex("DISTRIBUTOR_ROLE")),
          SOME_ADDRESS,
        ]),
      ],
    },
    {
      name: "should encode an AccessManager revokeRole for numeric roles",
      script: `access-control:revoke ${MANAGER} 42 ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(MANAGER, "revokeRole(uint64,address)", [
          Num(42n),
          SOME_ADDRESS,
        ]),
      ],
    },
  ],
});
