import "../../setup";

import type AragonOS from "@evmcrispr/module-aragonos";
import { CommandError, toDecimals } from "@evmcrispr/sdk";
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

describeCommand("revoke", {
  describeName:
    "AragonOS > commands > revoke <grantee> <app> <role> [removeManager]",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct revoke permission action",
      script: `revoke @app(disputable-voting.open:0) @app(acl:0) CREATE_PERMISSIONS_ROLE\n)`,
      validate: async (revokePermissionActions, interpreter) => {
        const role = keccak256(toHex("CREATE_PERMISSIONS_ROLE"));
        const expectedRevokePermissionActions = [
          createTestAction("revokePermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO.acl,
            role,
          ]),
        ];

        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel);
        const app = dao?.resolveApp("acl");
        const appPermission = app?.permissions.get(role);

        expect(
          appPermission?.grantees,
          "Grantee still exists on DAO app's permission",
        ).to.not.have.key(DAO["disputable-voting.open"]);
        expect(revokePermissionActions, "Returned actions mismatch").to.eql(
          expectedRevokePermissionActions,
        );
      },
    },
    {
      name: "should return a correct revoke and revoke manager action",
      script: `revoke @app(disputable-voting.open:0) @app(acl:0) CREATE_PERMISSIONS_ROLE true\n)`,
      validate: async (revokePermissionActions, interpreter) => {
        const rawRole = "CREATE_PERMISSIONS_ROLE";
        const role = keccak256(toHex(rawRole));
        const expectedRevokePermissionActions = [
          createTestAction("revokePermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO.acl,
            role,
          ]),
          createTestAction("removePermissionManager", DAO.acl, [
            DAO.acl,
            role,
          ]),
        ];

        const aragonos = interpreter.getModule("aragonos") as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel);
        const app = dao?.resolveApp(DAO.acl);
        const appPermission = app?.permissions.get(role);

        expect(
          appPermission?.grantees,
          "Grantee still exists on DAO app's permission",
        ).to.not.have.key(DAO["disputable-voting.open"]);
        expect(
          appPermission?.manager,
          "Permission manager still exists on DAO app's permission",
        ).to.not.exist;
        expect(revokePermissionActions, "Returned actions mismatch").to.eql(
          expectedRevokePermissionActions,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when passing an invalid remove manager flag",
      script: `revoke @app(disputable-voting.open) @app(acl) CREATE_PERMISSIONS_ROLE 1e18\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          `[removeManager] must be a boolean, got ${toDecimals(1, 18)}`,
        );
      },
    },
    {
      name: "should fail when revoking a permission from an entity that doesn't have it",
      script: `revoke @app(kernel) @app(acl) CREATE_PERMISSIONS_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          `grantee ${DAO.kernel} doesn't have the given permission`,
        );
      },
    },
    {
      name: "should fail when receiving a non-defined grantee identifier",
      script: `revoke non-defined-address @app(acl) CREATE_PERMISSIONS_ROLE\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving a non-defined app identifier",
      script: `revoke @app(kernel) non-defined-address CREATE_PERMISSIONS_ROLE\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving an invalid grantee address",
      script: `revoke false @app(acl) CREATE_PERMISSIONS_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(c, "<grantee> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving an invalid app address",
      script: `revoke @app(kernel) false CREATE_PERMISSIONS_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(c, "<app> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving a non-existent role",
      script: `revoke @app(kernel) @app(acl) NON_EXISTENT_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(c, "given permission doesn't exists on app acl");
      },
    },
    {
      name: "should fail when receiving an invalid hash role",
      script: `revoke @app(kernel) @app(acl) 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          `<role> must be a valid role hash (bytes32), got 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366`,
        );
      },
    },
    {
      name: "should fail when revoking a permission from a non-app entity",
      script: `revoke @app(disputable-voting.open) ${TEST_ACCOUNT_ADDRESS} A_ROLE\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(c, `${TEST_ACCOUNT_ADDRESS} is not a DAO's app`);
      },
    },
  ],
});

describeCommand("revoke", {
  describeName: "AragonOS > commands > revoke > special cases",
  module: "aragonos",
  cases: [
    {
      name: "should return a correct revoke permission action from a different DAO app",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    revoke @app(_${DAO.kernel}:disputable-voting.open) @app(_${DAO.kernel}:acl) CREATE_PERMISSIONS_ROLE\n  )\n)`,
      validate: async (revokeActions) => {
        const expectedRevokeActions = [
          createTestAction("revokePermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO.acl,
            keccak256(toHex("CREATE_PERMISSIONS_ROLE")),
          ]),
        ];
        expect(revokeActions).to.eql(expectedRevokeActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when passing an invalid DAO prefix",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    revoke @app(disputable-voting.open) @app(_invalid-dao-prefix:token-manager) SOME_ROLE\n  )\n)`,
      error: "invalid-dao-prefix",
    },
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos --as ar\nar:revoke ${DAO["disputable-voting.open"]} ${DAO.acl} CREATE_PERMISSIONS_ROLE`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
