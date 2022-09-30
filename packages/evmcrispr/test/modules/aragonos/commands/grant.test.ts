import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import type { Action } from '../../../../src/types';
import { oracle } from '../../../../src/modules/aragonos/utils';

import type { AragonOS } from '../../../../src/modules/aragonos/AragonOS';

import { CommandError } from '../../../../src/errors';

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

describe('AragonOS > commands > grant <entity> <app> <role> [permissionManager] [--params <acl params> | --oracle <aclOracleAddress>]', () => {
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

  it('should return a correct grant permission action', async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant @me vault TRANSFER_ROLE`,
    ]);

    const granteeActions = await interpreter.interpret();

    const expectedGranteeActions = [
      createTestAction('grantPermission', DAO.acl, [
        await signer.getAddress(),
        DAO.vault,
        utils.id('TRANSFER_ROLE'),
      ]),
    ];
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp('vault');
    const grantees = app?.permissions?.get(utils.id('TRANSFER_ROLE'))?.grantees;

    expect(granteeActions, 'Returned actions mismatch').to.eqls(
      expectedGranteeActions,
    );
    expect(
      grantees,
      "Grantee wasn't found on DAO app's permissions",
    ).to.include(await signer.getAddress());
  });

  it('should return a correct create permission action', async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant voting token-manager ISSUE_ROLE @me`,
    ]);

    const createPermissionAction = await interpreter.interpret();

    const expectedPermissionManager = await signer.getAddress();
    const expectedCreatePermissionActions = [
      createTestAction('createPermission', DAO.acl, [
        DAO.voting,
        DAO['token-manager'],
        utils.id('ISSUE_ROLE'),
        expectedPermissionManager,
      ]),
    ];
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp('token-manager');
    const permission = app?.permissions?.get(utils.id('ISSUE_ROLE'));

    expect(createPermissionAction, 'Returned actions mismatch').to.eql(
      expectedCreatePermissionActions,
    );
    expect(
      permission?.grantees,
      "Grantee wasn't found on DAO app's permission",
    ).to.have.key(DAO.voting);
    expect(
      permission?.manager,
      "DAO app's permission manager mismatch",
    ).to.equals(expectedPermissionManager);
  });

  it('should return a correct parametric permission action when receiving an oracle option', async () => {
    const interpreter = createAragonScriptInterpreter([
      'grant voting token-manager REVOKE_VESTINGS_ROLE voting --oracle token-manager',
    ]);

    const grantPActions = await interpreter.interpret();

    const expectedActions: Action[] = [
      createTestAction('createPermission', DAO.acl, [
        DAO.voting,
        DAO['token-manager'],
        utils.id('REVOKE_VESTINGS_ROLE'),
        DAO.voting,
      ]),
      createTestAction('grantPermissionP', DAO.acl, [
        DAO.voting,
        DAO['token-manager'],
        utils.id('REVOKE_VESTINGS_ROLE'),
        oracle(DAO['token-manager'])(),
      ]),
    ];

    expect(grantPActions).to.eql(expectedActions);
  });

  it(`should return a correct grant permission action from a different DAO app`, async () => {
    const interpreter = createInterpreter(
      `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            grant voting _1:tollgate.open:0 CHANGE_DESTINATION_ROLE
          )
        )
      `,
      signer,
    );

    const grantActions = await interpreter.interpret();

    const expectedGrantActions = [
      createTestAction('grantPermission', DAO.acl, [
        DAO2.voting,
        DAO['tollgate.open'],
        utils.id('CHANGE_DESTINATION_ROLE'),
      ]),
    ];

    expect(grantActions).to.eql(expectedGrantActions);
  });

  itChecksBadPermission('grant', (badPermission) =>
    createAragonScriptInterpreter([`grant ${badPermission.join(' ')}`]),
  );

  it('should fail when passing an invalid app DAO prefix', async () => {
    const invalidDAOPrefix = `invalid-dao-prefix`;
    const appIdentifier = `_${invalidDAOPrefix}:token-manager`;
    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            grant _1:voting ${appIdentifier} SOME_ROLE
          )
        )
      `,
      signer,
    );
    const c = findAragonOSCommandNode(interpreter.ast, 'grant', 1)!;
    const error = new CommandError(
      c,
      `couldn't found a DAO for ${invalidDAOPrefix} on given identifier ${appIdentifier}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when providing an invalid oracle option', async () => {
    const invalidOracle = 'invalid-oracle';
    const interpreter = createAragonScriptInterpreter([
      `grant voting token-manager REVOKE_VESTINGS_ROLE voting --oracle ${invalidOracle}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'grant')!;
    const error = new CommandError(
      c,
      `invalid --oracle option. Expected an address, but got ${invalidOracle}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when granting a parametric permission to an existent grantee', async () => {
    const interpreter = createAragonScriptInterpreter([
      `grant voting token-manager MINT_ROLE --oracle token-manager`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'grant')!;
    const error = new CommandError(
      c,
      `grantee ${DAO.voting} already has given permission on app token-manager`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos as ar

    ar:grant 0xc59d4acea08cf51974dfeb422964e6c2d7eb906f 0x1c06257469514574c0868fdcb83c5509b5513870 TRANSFER_ROLE
  `,
      signer,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'must be used within a "connect" command',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when granting a permission to an address that already has it', async () => {
    const app = 'token-manager';
    const interpreter = createAragonScriptInterpreter([
      `grant voting ${app} MINT_ROLE`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'grant')!;
    const error = new CommandError(
      c,
      `grantee already has given permission on app ${app}`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
