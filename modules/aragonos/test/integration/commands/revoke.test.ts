import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import type AragonOS from "@evmcrispr/module-aragonos";
import {
  CommandError,
  type CommandExpressionNode,
  toDecimals,
} from "@evmcrispr/sdk";
import {
  expect,
  expectThrowAsync,
  getPublicClient,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";
import { DAO, DAO2 } from "../../fixtures";
import { createTestAction } from "../../test-helpers/actions";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
  itChecksBadPermission,
} from "../../test-helpers/aragonos";
import type { TestInterpreter } from "../../test-helpers/evml";
import { createInterpreter } from "../../test-helpers/evml";

describe("AragonOS > commands > revoke <grantee> <app> <role> [removeManager]", () => {
  let client: PublicClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  beforeAll(async () => {
    client = getPublicClient();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      client,
      DAO.kernel,
    );
  });

  it("should return a correct revoke permission action", async () => {
    const interpeter = createAragonScriptInterpreter([
      "revoke @app(disputable-voting.open:0) @app(acl:0) CREATE_PERMISSIONS_ROLE",
    ]);

    const revokePermissionActions = await interpeter.interpret();

    const role = keccak256(toHex("CREATE_PERMISSIONS_ROLE"));
    const expectedRevokePermissionActions = [
      createTestAction("revokePermission", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO.acl,
        role,
      ]),
    ];

    const aragonos = interpeter.getModule("aragonos") as AragonOS;
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
  });

  it("should return a correct revoke and revoke manager action", async () => {
    const rawRole = "CREATE_PERMISSIONS_ROLE";
    const interpreter = createAragonScriptInterpreter([
      `revoke @app(disputable-voting.open:0) @app(acl:0) ${rawRole} true`,
    ]);

    const revokePermissionActions = await interpreter.interpret();

    const role = keccak256(toHex(rawRole));
    const expectedRevokePermissionActions = [
      createTestAction("revokePermission", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO.acl,
        role,
      ]),
      createTestAction("removePermissionManager", DAO.acl, [DAO.acl, role]),
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
  });

  it("should return a correct revoke permission action from a different DAO app", async () => {
    const interpreter = await createInterpreter(
      `
      load aragonos --as ar

      ar:connect ${DAO.kernel} (
        connect ${DAO2.kernel} (
          revoke @app(_${DAO.kernel}:disputable-voting.open) @app(_${DAO.kernel}:acl) CREATE_PERMISSIONS_ROLE
        )
      )
    `,
      client,
    );

    const revokeActions = await interpreter.interpret();

    const expectedRevokeActions = [
      createTestAction("revokePermission", DAO.acl, [
        DAO["disputable-voting.open"],
        DAO.acl,
        keccak256(toHex("CREATE_PERMISSIONS_ROLE")),
      ]),
    ];

    expect(revokeActions).to.eql(expectedRevokeActions);
  });

  itChecksBadPermission("revoke", (badPermission) =>
    createAragonScriptInterpreter([`revoke ${badPermission.join(" ")}`]),
  );

  it("should fail when passing an invalid DAO prefix", async () => {
    const invalidDAOPrefix = `invalid-dao-prefix`;
    const appIdentifier = `_${invalidDAOPrefix}:token-manager`;
    const interpreter = createInterpreter(
      `
        load aragonos --as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            revoke @app(disputable-voting.open) @app(${appIdentifier}) SOME_ROLE
          )
        )
      `,
      client,
    );

    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err).to.be.an.instanceOf(Error);
      expect(err.message).to.include(invalidDAOPrefix);
    }
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:revoke ${DAO["disputable-voting.open"]} ${DAO.acl} CREATE_PERMISSIONS_ROLE`,
      client,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'must be used within a "connect" command',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid remove manager flag", async () => {
    const interpreter = createAragonScriptInterpreter([
      "revoke @app(disputable-voting.open) @app(acl) CREATE_PERMISSIONS_ROLE 1e18",
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
    const error = new CommandError(
      c,
      `[removeManager] must be a boolean, got ${toDecimals(1, 18)}`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when revoking a permission from a non-app entity", async () => {
    let interpreter: TestInterpreter;
    let c: CommandExpressionNode;
    const nonAppAddress = TEST_ACCOUNT_ADDRESS;

    interpreter = createAragonScriptInterpreter([
      `revoke @app(disputable-voting.open) ${nonAppAddress} A_ROLE`,
    ]);
    c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
    let error = new CommandError(c, `${nonAppAddress} is not a DAO's app`);

    await expectThrowAsync(
      () => interpreter.interpret(),
      error,
      `Unknown identifier didn't fail properly`,
    );

    interpreter = createAragonScriptInterpreter([
      `revoke @app(disputable-voting.open) ${nonAppAddress} MY_ROLE`,
    ]);
    c = findAragonOSCommandNode(interpreter.ast, "revoke")!;

    error = new CommandError(c, `${nonAppAddress} is not a DAO's app`);

    await expectThrowAsync(
      () =>
        createAragonScriptInterpreter([
          `revoke @app(disputable-voting.open) ${nonAppAddress} MY_ROLE`,
        ]).interpret(),
      error,
    );
  });

  it("should fail when revoking a permission from an entity that doesn't have it", async () => {
    const interpreter = createAragonScriptInterpreter([
      "revoke @app(kernel) @app(acl) CREATE_PERMISSIONS_ROLE",
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "revoke")!;
    const error = new CommandError(
      c,
      `grantee ${DAO.kernel} doesn't have the given permission`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
