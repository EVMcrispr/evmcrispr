import type { Action } from '@1hive/evmcrispr';
import { CommandError } from '@1hive/evmcrispr';
import {
  DAO,
  DAO2,
  createInterpreter,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import type { AragonOS } from '../../src/AragonOS';
import { oracle } from '../../src/utils';
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  createTestAction,
  findAragonOSCommandNode,
  itChecksBadPermission,
} from '../utils';

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
      `grant @me agent TRANSFER_ROLE`,
    ]);

    const granteeActions = await interpreter.interpret();

    const expectedGranteeActions = [
      createTestAction('grantPermission', DAO.acl, [
        await signer.getAddress(),
        DAO.agent,
        utils.id('TRANSFER_ROLE'),
      ]),
    ];
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp('agent');
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
      `grant disputable-voting.open wrappable-hooked-token-manager.open WRAP_TOKEN_ROLE @me`,
    ]);

    const createPermissionAction = await interpreter.interpret();

    const expectedPermissionManager = await signer.getAddress();
    const expectedCreatePermissionActions = [
      createTestAction('createPermission', DAO.acl, [
        DAO['disputable-voting.open'],
        DAO['wrappable-hooked-token-manager.open'],
        utils.id('WRAP_TOKEN_ROLE'),
        expectedPermissionManager,
      ]),
    ];
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);
    const app = dao?.resolveApp('wrappable-hooked-token-manager.open');
    const permission = app?.permissions?.get(utils.id('WRAP_TOKEN_ROLE'));

    expect(createPermissionAction, 'Returned actions mismatch').to.eql(
      expectedCreatePermissionActions,
    );
    expect(
      permission?.grantees,
      "Grantee wasn't found on DAO app's permission",
    ).to.have.key(DAO['disputable-voting.open']);
    expect(
      permission?.manager,
      "DAO app's permission manager mismatch",
    ).to.equals(expectedPermissionManager);
  });

  it('should return a correct parametric permission action when receiving an oracle option', async () => {
    const interpreter = createAragonScriptInterpreter([
      'grant disputable-voting.open wrappable-hooked-token-manager.open WRAP_TOKEN_ROLE disputable-voting.open --oracle wrappable-hooked-token-manager.open',
    ]);

    const grantPActions = await interpreter.interpret();

    const expectedActions: Action[] = [
      createTestAction('createPermission', DAO.acl, [
        DAO['disputable-voting.open'],
        DAO['wrappable-hooked-token-manager.open'],
        utils.id('WRAP_TOKEN_ROLE'),
        DAO['disputable-voting.open'],
      ]),
      createTestAction('grantPermissionP', DAO.acl, [
        DAO['disputable-voting.open'],
        DAO['wrappable-hooked-token-manager.open'],
        utils.id('WRAP_TOKEN_ROLE'),
        oracle(DAO['wrappable-hooked-token-manager.open'])(),
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
            grant disputable-voting.open _${DAO.kernel}:disputable-voting.open CREATE_VOTES_ROLE
          )
        )
      `,
      signer,
    );

    const grantActions = await interpreter.interpret();

    const expectedGrantActions = [
      createTestAction('grantPermission', DAO.acl, [
        DAO2['disputable-voting.open'],
        DAO['disputable-voting.open'],
        utils.id('CREATE_VOTES_ROLE'),
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
            grant _${DAO.kernel}:disputable-voting.open ${appIdentifier} SOME_ROLE
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
      `grant disputable-voting.open wrappable-hooked-token-manager.open REVOKE_VESTINGS_ROLE disputable-voting.open --oracle ${invalidOracle}`,
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
      `grant augmented-bonding-curve.open wrappable-hooked-token-manager.open MINT_ROLE --oracle wrappable-hooked-token-manager.open`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'grant')!;
    const error = new CommandError(
      c,
      `grantee ${DAO['augmented-bonding-curve.open']} already has given permission on app wrappable-hooked-token-manager`,
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
    const app = 'wrappable-hooked-token-manager.open';
    const interpreter = createAragonScriptInterpreter([
      `grant augmented-bonding-curve.open ${app} MINT_ROLE`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'grant')!;
    const error = new CommandError(
      c,
      `grantee already has given permission on app ${app.slice(
        0,
        app.indexOf('.'),
      )}`,
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
