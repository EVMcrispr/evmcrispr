import "../../setup";

import { oracle } from "@evmcrispr/module-aragonos/utils";
import { type Action, CommandError } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, toHex } from "viem";
import { DAO } from "../../fixtures";
import { createTestAction } from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos [grant @app]\naragonos:connect ${DAO.kernel} (`;

describeCommand("grant", {
  describeName:
    "AragonOS > commands > grant <role> on <app> to <entity> [permissionManager] [--params <acl params> | --oracle <aclOracleAddress>]",
  module: "aragonos",
  preamble,
  docCases: [
    {
      description: "Grant a role to the connected wallet",
      code: `aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  aragonos:grant TRANSFER_ROLE on @aragonos:app(agent) to @me\n)`,
    },
  ],
  cases: [
    {
      name: "should return a correct grant permission action",
      script: `grant TRANSFER_ROLE on @app(agent) to @me\n)`,
      validate: async (granteeActions) => {
        const expectedGranteeActions = [
          createTestAction("grantPermission", DAO.acl, [
            TEST_ACCOUNT_ADDRESS,
            DAO.agent,
            keccak256(toHex("TRANSFER_ROLE")),
          ]),
        ];
        expect(granteeActions, "Returned actions mismatch").to.eqls(
          expectedGranteeActions,
        );
      },
    },
    {
      name: "should return a correct create permission action",
      script: `grant WRAP_TOKEN_ROLE on @app(wrappable-hooked-token-manager.open) to @app(disputable-voting.open) @me\n)`,
      validate: async (createPermissionAction) => {
        const expectedPermissionManager = TEST_ACCOUNT_ADDRESS;
        const expectedCreatePermissionActions = [
          createTestAction("createPermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO["wrappable-hooked-token-manager.open"],
            keccak256(toHex("WRAP_TOKEN_ROLE")),
            expectedPermissionManager,
          ]),
        ];
        expect(createPermissionAction, "Returned actions mismatch").to.eql(
          expectedCreatePermissionActions,
        );
      },
    },
    {
      name: "should return a correct parametric permission action when receiving an oracle option",
      script: `grant WRAP_TOKEN_ROLE on @app(wrappable-hooked-token-manager.open) to @app(disputable-voting.open) @app(disputable-voting.open) --oracle @app(wrappable-hooked-token-manager.open)\n)`,
      validate: async (grantPActions) => {
        const expectedActions: Action[] = [
          createTestAction("createPermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO["wrappable-hooked-token-manager.open"],
            keccak256(toHex("WRAP_TOKEN_ROLE")),
            DAO["disputable-voting.open"],
          ]),
          createTestAction("grantPermissionP", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO["wrappable-hooked-token-manager.open"],
            keccak256(toHex("WRAP_TOKEN_ROLE")),
            oracle(DAO["wrappable-hooked-token-manager.open"])(),
          ]),
        ];
        expect(grantPActions).to.eql(expectedActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when providing an invalid oracle option",
      script: `grant REVOKE_VESTINGS_ROLE on @app(wrappable-hooked-token-manager.open) to @app(disputable-voting.open) @app(disputable-voting.open) --oracle invalid-oracle\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          `--oracle must be a valid address, got invalid-oracle`,
        );
      },
    },
    {
      name: "should fail when granting a parametric permission to an existent grantee",
      script: `grant MINT_ROLE on @app(wrappable-hooked-token-manager.open) to @app(augmented-bonding-curve.open) --oracle @app(wrappable-hooked-token-manager.open)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          `grantee ${DAO["augmented-bonding-curve.open"]} already has given permission on app wrappable-hooked-token-manager`,
        );
      },
    },
    {
      name: "should fail when granting a permission to an address that already has it",
      script: `grant MINT_ROLE on @app(wrappable-hooked-token-manager.open) to @app(augmented-bonding-curve.open)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          `grantee already has given permission on app wrappable-hooked-token-manager`,
        );
      },
    },
    {
      name: "should fail when receiving a non-defined grantee identifier",
      script: `grant CREATE_PERMISSIONS_ROLE on @app(acl) to non-defined-address\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving a non-defined app identifier",
      script: `grant CREATE_PERMISSIONS_ROLE on non-defined-address to @app(kernel)\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving an invalid grantee address",
      script: `grant CREATE_PERMISSIONS_ROLE on @app(acl) to false\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          "<grantee> must be a valid address, got false",
        );
      },
    },
    {
      name: "should fail when receiving an invalid app address",
      script: `grant CREATE_PERMISSIONS_ROLE on false to @app(kernel)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(c, "<app> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving a non-existent role",
      script: `grant NON_EXISTENT_ROLE on @app(acl) to @app(kernel)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          "given permission doesn't exists on app acl",
        );
      },
    },
    {
      name: "should fail when receiving an invalid hash role",
      script: `grant 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366 on @app(acl) to @app(kernel)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(
          c,
          `<role> must be a valid role hash (bytes32), got 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366`,
        );
      },
    },
  ],
});

describeCommand("grant", {
  describeName: "AragonOS > commands > grant > special cases",
  module: "aragonos",
  errorCases: [
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos\naragonos:grant TRANSFER_ROLE on 0x1c06257469514574c0868fdcb83c5509b5513870 to 0xc59d4acea08cf51974dfeb422964e6c2d7eb906f`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
