import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { AragonOS } from '../../../../src/cas11/modules/aragonos/AragonOS';

import { CommandError } from '../../../../src/errors';

import { DAO } from '../../../fixtures';
import { createTestAction } from '../../../test-helpers/actions';
import { createAragonScriptInterpreter as createAragonScriptInterpreter_ } from '../../../test-helpers/aragonos';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const grantDescribe = (): Suite =>
  describe('grant <entity> <app> <role> [permissionManager]', () => {
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

    it('should grant a permission correctly', async () => {
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
      const grantees = app?.permissions?.get(
        utils.id('TRANSFER_ROLE'),
      )?.grantees;

      expect(granteeActions, 'Returned actions mismatch').to.eqls(
        expectedGranteeActions,
      );
      expect(
        grantees,
        "Grantee wasn't found on DAO app's permissions",
      ).to.include(await signer.getAddress());
    });

    it('should create a new permission correctly', async () => {
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

    it('should fail when executing it outside a "connect" command', async () => {
      const error = new CommandError(
        'grant',
        'must be used within a "connect" command',
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        load aragonos as ar

        ar:grant 0xc59d4acea08cf51974dfeb422964e6c2d7eb906f 0x1c06257469514574c0868fdcb83c5509b5513870 TRANSFER_ROLE
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when granting an unknown permission', async () => {
      const error = new CommandError(
        'grant',
        "given permission doesn't exists on app token-manager",
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'grant voting token-manager UNKNOWN_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when granting a permission to an address that already has it', async () => {
      const error = new CommandError('grant', 'permission manager missing');
      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'grant voting token-manager ISSUE_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when creating a permission without a permission manager', async () => {
      const error = new CommandError('grant', 'permission manager missing');

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'grant voting token-manager ISSUE_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when creating a permission with an invalid permission manager', async () => {
      const invalidPermissionManager = 'invalidPermissionManager';
      const error = new CommandError(
        'grant',
        `invalid permission manager. Expected an address, but got ${invalidPermissionManager}`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `grant voting token-manager ISSUE_ROLE "${invalidPermissionManager}"`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
