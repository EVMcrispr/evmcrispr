import "../../setup";

import type AragonOS from "@evmcrispr/module-aragonos";
import { oracle } from "@evmcrispr/module-aragonos/utils";
import { type Action, CommandError } from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";
import { DAO, DAO2 } from "../../fixtures";
import { createTestAction } from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos --as ar\nar:connect ${DAO.kernel} (`;

describeCommand("grant", {
  describeName:
    "AragonOS > commands > grant <entity> <app> <role> [permissionManager] [--params <acl params> | --oracle <aclOracleAddress>]",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct grant permission action",
      script: `grant @me @app(agent) TRANSFER_ROLE\n)`,
      validate: async (granteeActions, interpreter) => {
        const expectedGranteeActions = [
          createTestAction("grantPermission", DAO.acl, [
            TEST_ACCOUNT_ADDRESS,
            DAO.agent,
            keccak256(toHex("TRANSFER_ROLE")),
          ]),
        ];
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel);
        const app = dao?.resolveApp("agent");
        const grantees = app?.permissions?.get(
          keccak256(toHex("TRANSFER_ROLE")),
        )?.grantees;

        expect(granteeActions, "Returned actions mismatch").to.eqls(
          expectedGranteeActions,
        );
        expect(
          grantees,
          "Grantee wasn't found on DAO app's permissions",
        ).to.include(TEST_ACCOUNT_ADDRESS);
      },
    },
    {
      name: "should return a correct create permission action",
      script: `grant @app(disputable-voting.open) @app(wrappable-hooked-token-manager.open) WRAP_TOKEN_ROLE @me\n)`,
      validate: async (createPermissionAction, interpreter) => {
        const expectedPermissionManager = TEST_ACCOUNT_ADDRESS;
        const expectedCreatePermissionActions = [
          createTestAction("createPermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO["wrappable-hooked-token-manager.open"],
            keccak256(toHex("WRAP_TOKEN_ROLE")),
            expectedPermissionManager,
          ]),
        ];
        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel);
        const app = dao?.resolveApp("wrappable-hooked-token-manager.open");
        const permission = app?.permissions?.get(
          keccak256(toHex("WRAP_TOKEN_ROLE")),
        );

        expect(createPermissionAction, "Returned actions mismatch").to.eql(
          expectedCreatePermissionActions,
        );
        expect(
          permission?.grantees,
          "Grantee wasn't found on DAO app's permission",
        ).to.have.key(DAO["disputable-voting.open"]);
        expect(
          permission?.manager,
          "DAO app's permission manager mismatch",
        ).to.equals(expectedPermissionManager);
      },
    },
    {
      name: "should return a correct parametric permission action when receiving an oracle option",
      script: `grant @app(disputable-voting.open) @app(wrappable-hooked-token-manager.open) WRAP_TOKEN_ROLE @app(disputable-voting.open) --oracle @app(wrappable-hooked-token-manager.open)\n)`,
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
      script: `grant @app(disputable-voting.open) @app(wrappable-hooked-token-manager.open) REVOKE_VESTINGS_ROLE @app(disputable-voting.open) --oracle invalid-oracle\n)`,
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
      script: `grant @app(augmented-bonding-curve.open) @app(wrappable-hooked-token-manager.open) MINT_ROLE --oracle @app(wrappable-hooked-token-manager.open)\n)`,
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
      script: `grant @app(augmented-bonding-curve.open) @app(wrappable-hooked-token-manager.open) MINT_ROLE\n)`,
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
      script: `grant non-defined-address @app(acl) CREATE_PERMISSIONS_ROLE\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving a non-defined app identifier",
      script: `grant @app(kernel) non-defined-address CREATE_PERMISSIONS_ROLE\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving an invalid grantee address",
      script: `grant false @app(acl) CREATE_PERMISSIONS_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(c, "<grantee> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving an invalid app address",
      script: `grant @app(kernel) false CREATE_PERMISSIONS_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(c, "<app> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving a non-existent role",
      script: `grant @app(kernel) @app(acl) NON_EXISTENT_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "grant")!;
        return new CommandError(c, "given permission doesn't exists on app acl");
      },
    },
    {
      name: "should fail when receiving an invalid hash role",
      script: `grant @app(kernel) @app(acl) 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366\n)`,
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
  cases: [
    {
      name: "should return a correct grant permission action from a different DAO app",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    grant @app(disputable-voting.open) @app(_${DAO.kernel}:disputable-voting.open) CREATE_VOTES_ROLE\n  )\n)`,
      validate: async (grantActions) => {
        const expectedGrantActions = [
          createTestAction("grantPermission", DAO.acl, [
            DAO2["disputable-voting.open"],
            DAO["disputable-voting.open"],
            keccak256(toHex("CREATE_VOTES_ROLE")),
          ]),
        ];
        expect(grantActions).to.eql(expectedGrantActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when passing an invalid app DAO prefix",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    grant @app(_${DAO.kernel}:disputable-voting.open) @app(_invalid-dao-prefix:token-manager) SOME_ROLE\n  )\n)`,
      error: "invalid-dao-prefix",
    },
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos --as ar\nar:grant 0xc59d4acea08cf51974dfeb422964e6c2d7eb906f 0x1c06257469514574c0868fdcb83c5509b5513870 TRANSFER_ROLE`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
