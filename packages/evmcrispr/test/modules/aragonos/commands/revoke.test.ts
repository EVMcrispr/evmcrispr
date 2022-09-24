import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import type { EVMcrispr } from '../../../../src/EVMcrispr';

import type { AragonOS } from '../../../../src/modules/aragonos/AragonOS';
import type { CommandExpressionNode } from '../../../../src/types';
import { CommandError } from '../../../../src/errors';
import { toDecimals } from '../../../../src/utils';

import { DAO } from '../../../fixtures';
import { DAO as DAO2 } from '../../../fixtures/mock-dao-2';
import { createTestAction } from '../../../test-helpers/actions';

import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
  itChecksBadPermission,
} from '../../../test-helpers/aragonos';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';
import { ANY_ENTITY } from '../../../../src/modules/aragonos/utils';

describe('AragonOS > commands > revoke <grantee> <app> <role> [removeManager]', () => {
  let signer: Signer;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  before(async () => {
    [signer] = await ethers.getSigners();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      signer,
      DAO.kernel,
    );
  });

  it('should return a correct revoke permission action', async () => {
    const interpeter = createAragonScriptInterpreter([
      'revoke finance:0 vault:0 TRANSFER_ROLE',
    ]);

    const revokePermissionActions = await interpeter.interpret();

    const role = utils.id('TRANSFER_ROLE');
    const expectedRevokePermissionActions = [
      createTestAction('revokePermission', DAO.acl, [
        DAO.finance,
        DAO.vault,
        role,
      ]),
    ];

    const aragonos = interpeter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp('vault');
    const appPermission = app?.permissions.get(role);

    expect(
      appPermission?.grantees,
      "Grantee still exists on DAO app's permission",
    ).to.not.have.key(DAO.finance);
    expect(revokePermissionActions, 'Returned actions mismatch').to.eql(
      expectedRevokePermissionActions,
    );
  });

  it('should return a correct revoke and revoke manager action', async () => {
    const rawRole = 'CREATE_VOTES_ROLE';
    const interpreter = createAragonScriptInterpreter([
      `revoke ANY_ENTITY disputable-voting.open ${rawRole} true`,
    ]);

    const revokePermissionActions = await interpreter.interpret();

    const role = utils.id(rawRole);
    const expectedRevokePermissionActions = [
      createTestAction('revokePermission', DAO.acl, [
        ANY_ENTITY,
        DAO['disputable-voting.open'],
        role,
      ]),
      createTestAction('removePermissionManager', DAO.acl, [
        DAO['disputable-voting.open'],
        role,
      ]),
    ];

    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp(DAO['disputable-voting.open']);
    const appPermission = app?.permissions.get(role);

    expect(
      appPermission?.grantees,
      "Grantee still exists on DAO app's permission",
    ).to.not.have.key(ANY_ENTITY);
    expect(
      appPermission?.manager,
      "Permission manager still exists on DAO app's permission",
    ).to.not.exist;
    expect(revokePermissionActions, 'Returned actions mismatch').to.eql(
      expectedRevokePermissionActions,
    );
  });

  it('should return a correct revoke permission action from a different DAO app', async () => {
    const interpreter = await createInterpreter(
      `
      load aragonos as ar

      ar:connect ${DAO.kernel} (
        connect ${DAO2.kernel} (
          revoke _1:finance _1:vault TRANSFER_ROLE
        )
      )
    `,
      signer,
    );

    const revokeActions = await interpreter.interpret();

    const expectedRevokeActions = [
      createTestAction('revokePermission', DAO.acl, [
        DAO.finance,
        DAO.vault,
        utils.id('TRANSFER_ROLE'),
      ]),
    ];

    expect(revokeActions).to.eql(expectedRevokeActions);
  });

  itChecksBadPermission('revoke', (badPermission) =>
    createAragonScriptInterpreter([`revoke ${badPermission.join(' ')}`]),
  );

  it('should fail when passing an invalid DAO prefix', async () => {
    const invalidDAOPrefix = `invalid-dao-prefix`;
    const appIdentifier = `_${invalidDAOPrefix}:token-manager`;
    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            revoke _1:voting ${appIdentifier} SOME_ROLE
          )
        )
      `,
      signer,
    );
    const c = findAragonOSCommandNode(interpreter.ast, 'revoke', 1)!;

    const error = new CommandError(
      c,
      `couldn't found a DAO for ${invalidDAOPrefix} on given identifier ${appIdentifier}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
      load aragonos as ar
      ar:revoke voting token-manager MINT_ROLE`,
      signer,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'must be used within a "connect" command',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing an invalid remove manager flag', async () => {
    const interpreter = createAragonScriptInterpreter([
      'revoke voting token-manager MINT_ROLE 1e18',
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'revoke')!;
    const error = new CommandError(
      c,
      `invalid remove manager flag. Expected boolean but got ${typeof toDecimals(
        1,
        18,
      )}`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when revoking a permission from a non-app entity', async () => {
    let interpreter: EVMcrispr;
    let c: CommandExpressionNode;
    const nonAppAddress = await signer.getAddress();

    interpreter = createAragonScriptInterpreter([
      `revoke voting ${nonAppAddress} A_ROLE`,
    ]);
    c = findAragonOSCommandNode(interpreter.ast, 'revoke')!;
    let error = new CommandError(c, `${nonAppAddress} is not a DAO's app`);

    await expectThrowAsync(
      () => interpreter.interpret(),
      error,
      `Unknown identifier didn't fail properly`,
    );

    interpreter = createAragonScriptInterpreter([
      `revoke voting ${nonAppAddress} MY_ROLE`,
    ]);
    c = findAragonOSCommandNode(interpreter.ast, 'revoke')!;

    error = new CommandError(c, `${nonAppAddress} is not a DAO's app`);

    await expectThrowAsync(
      () =>
        createAragonScriptInterpreter([
          `revoke voting ${nonAppAddress} MY_ROLE`,
        ]).interpret(),
      error,
    );
  });

  it("should fail when revoking a permission from an entity that doesn't have it", async () => {
    const interpreter = createAragonScriptInterpreter([
      'revoke voting token-manager ISSUE_ROLE',
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'revoke')!;
    const error = new CommandError(
      c,
      `grantee ${DAO.voting} doesn't have the given permission`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
