import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { SOME_ADDRESS, TOKEN_DISTRO } from "../../fixtures";

const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const MANAGER = "0x1111111111111111111111111111111111111111";

describeCommand("grant", {
  describeName:
    "AccessControl > commands > grant <role> on <target> to <account> [--delay]",
  module: "access-control",
  preamble: "load access-control",
  cases: [
    {
      name: "should hash string roles and encode an AccessControl grantRole",
      script: `access-control:grant MINTER_ROLE on ${TOKEN_DISTRO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "grantRole(bytes32,address)", [
          MINTER_ROLE,
          SOME_ADDRESS,
        ]),
      ],
    },
    {
      name: "should map DEFAULT_ADMIN_ROLE to bytes32 zero",
      script: `access-control:grant DEFAULT_ADMIN_ROLE on ${TOKEN_DISTRO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "grantRole(bytes32,address)", [
          ZERO_BYTES32,
          SOME_ADDRESS,
        ]),
      ],
    },
    {
      name: "should pass bytes32 roles through untouched",
      script: `access-control:grant ${MINTER_ROLE} on ${TOKEN_DISTRO} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(TOKEN_DISTRO, "grantRole(bytes32,address)", [
          MINTER_ROLE,
          SOME_ADDRESS,
        ]),
      ],
    },
    {
      name: "should encode an AccessManager grantRole for numeric roles",
      script: `access-control:grant 42 on ${MANAGER} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(MANAGER, "grantRole(uint64,address,uint32)", [
          Num(42n),
          SOME_ADDRESS,
          Num(0n),
        ]),
      ],
    },
    {
      name: "should encode the execution delay for AccessManager roles",
      script: `access-control:grant 42 on ${MANAGER} to ${SOME_ADDRESS} --delay 86400`,
      expectedActions: [
        encodeAction(MANAGER, "grantRole(uint64,address,uint32)", [
          Num(42n),
          SOME_ADDRESS,
          Num(86400n),
        ]),
      ],
    },
    {
      name: "should accept the ADMIN_ROLE and PUBLIC_ROLE aliases",
      script: `access-control:grant ADMIN_ROLE on ${MANAGER} to ${SOME_ADDRESS}`,
      expectedActions: [
        encodeAction(MANAGER, "grantRole(uint64,address,uint32)", [
          Num(0n),
          SOME_ADDRESS,
          Num(0n),
        ]),
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail when --delay is used with an AccessControl role",
      script: `access-control:grant MINTER_ROLE on ${TOKEN_DISTRO} to ${SOME_ADDRESS} --delay 3600`,
      error: "--delay only applies to AccessManager",
    },
    {
      name: "should fail for role ids above uint64",
      script: `access-control:grant 18446744073709551616 on ${MANAGER} to ${SOME_ADDRESS}`,
      error: "role ids must be integers",
    },
    {
      name: "should fail for malformed hex roles",
      script: `access-control:grant 0xabcd on ${TOKEN_DISTRO} to ${SOME_ADDRESS}`,
      error: "hex roles must be 32 bytes",
    },
  ],
});
