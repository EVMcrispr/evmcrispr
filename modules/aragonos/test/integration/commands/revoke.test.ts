import "../../setup";

import { CommandError } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { keccak256, parseUnits, toHex } from "viem";
import { DAO } from "../../fixtures";
import { createTestAction } from "../../test-helpers/actions";
import { findAragonOSCommandNode } from "../../test-helpers/aragonos";

const preamble = `load aragonos [revoke @app]\naragonos:connect ${DAO.kernel} (`;

describeCommand("revoke", {
  describeName:
    "AragonOS > commands > revoke <role> on <app> from <grantee> [removeManager]",
  module: "aragonos",
  preamble,
  docCases: [
    {
      description: "Revoke a permission",
      code: "aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  aragonos:revoke CREATE_PERMISSIONS_ROLE on @aragonos:app(acl) from @aragonos:app(disputable-voting.open)\n)",
    },
  ],
  cases: [
    {
      name: "should return a correct revoke permission action",
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(disputable-voting.open)\n)`,
      validate: async (revokePermissionActions) => {
        const role = keccak256(toHex("CREATE_PERMISSIONS_ROLE"));
        const expectedRevokePermissionActions = [
          createTestAction("revokePermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO.acl,
            role,
          ]),
        ];

        expect(revokePermissionActions, "Returned actions mismatch").to.eql(
          expectedRevokePermissionActions,
        );
      },
    },
    {
      name: "should return a correct revoke and revoke manager action",
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(disputable-voting.open) true\n)`,
      validate: async (revokePermissionActions) => {
        const rawRole = "CREATE_PERMISSIONS_ROLE";
        const role = keccak256(toHex(rawRole));
        const expectedRevokePermissionActions = [
          createTestAction("revokePermission", DAO.acl, [
            DAO["disputable-voting.open"],
            DAO.acl,
            role,
          ]),
          createTestAction("removePermissionManager", DAO.acl, [DAO.acl, role]),
        ];

        expect(revokePermissionActions, "Returned actions mismatch").to.eql(
          expectedRevokePermissionActions,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when passing an invalid remove manager flag",
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(disputable-voting.open) 1e18\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          `[removeManager] must be a boolean, got ${parseUnits("1", 18)}`,
        );
      },
    },
    {
      name: "should fail when revoking a permission from an entity that doesn't have it",
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from @app(kernel)\n)`,
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
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from non-defined-address\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving a non-defined app identifier",
      script: `revoke CREATE_PERMISSIONS_ROLE on non-defined-address from @app(kernel)\n)`,
      error: "non-defined-address",
    },
    {
      name: "should fail when receiving an invalid grantee address",
      script: `revoke CREATE_PERMISSIONS_ROLE on @app(acl) from false\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          "<grantee> must be a valid address, got false",
        );
      },
    },
    {
      name: "should fail when receiving an invalid app address",
      script: `revoke CREATE_PERMISSIONS_ROLE on false from @app(kernel)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(c, "<app> must be a valid address, got false");
      },
    },
    {
      name: "should fail when receiving a non-existent role",
      script: `revoke NON_EXISTENT_ROLE on @app(acl) from @app(kernel)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          "given permission doesn't exists on app acl",
        );
      },
    },
    {
      name: "should fail when receiving an invalid hash role",
      script: `revoke 0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366 on @app(acl) from @app(kernel)\n)`,
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
      script: `revoke A_ROLE on ${TEST_ACCOUNT_ADDRESS} from @app(disputable-voting.open)\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
        return new CommandError(
          c,
          `${TEST_ACCOUNT_ADDRESS} is not a DAO's app`,
        );
      },
    },
  ],
});

describeCommand("revoke", {
  describeName: "AragonOS > commands > revoke > special cases",
  module: "aragonos",
  errorCases: [
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos\naragonos:revoke CREATE_PERMISSIONS_ROLE on ${DAO.acl} from ${DAO["disputable-voting.open"]}`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
