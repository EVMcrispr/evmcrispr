import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { AragonOS } from '../../../../src/cas11/modules/aragonos/AragonOS';
import { CommandError } from '../../../../src/errors';
import { ANY_ENTITY, toDecimals } from '../../../../src/utils';

import { DAO } from '../../../fixtures';
import { createTestAction } from '../../../test-helpers/actions';

import { createAragonScriptInterpreter as createAragonScriptInterpreter_ } from '../../../test-helpers/aragonos';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const revokeDescribe = (): Suite =>
  describe('revoke <grantee> <app> <role> [removeManager]', () => {
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

    it('should revoke a permission correctly', async () => {
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
    it('should revoke a permission and a manager correctly', async () => {
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
    it('should fail when executing it outside a "connect" command', async () => {
      const error = new CommandError(
        'revoke',
        'must be used within a "connect" command',
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
          load aragonos as ar
          ar:revoke voting token-manager MINT_ROLE`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
    it('should fail when passing an invalid grantee address', async () => {
      const error = new CommandError(
        'revoke',
        `grantee must be a valid address, got ${toDecimals(1, 18).toString()}`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'revoke 1e18 token-manager MINT_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
    it('should fail when passing an invalid remove manager flag', async () => {
      const error = new CommandError(
        'revoke',
        `invalid remove manager flag. Expected boolean but got ${typeof toDecimals(
          1,
          18,
        )}`,
      );
      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'revoke voting token-manager MINT_ROLE 1e18',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
    it('should fail when revoking a permission from a non-app entity', async () => {
      const nonAppAddress = await signer.getAddress();
      const unknownIdentifier = 'unknown-app.open';
      let error = new CommandError(
        'revoke',
        `${unknownIdentifier} is not a DAO's app`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `revoke voting ${unknownIdentifier} A_ROLE`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
        `Unknown identifier didn't fail properly`,
      );

      error = new CommandError('revoke', `${nonAppAddress} is not a DAO's app`);

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `revoke voting ${nonAppAddress} MY_ROLE`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
    it('should fail when revoking a non-existent permission', async () => {
      const error = new CommandError(
        'revoke',
        `given permission doesn't exists on app token-manager`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'revoke voting token-manager UNKNOWN_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
    it("should fail when revoking a permission from an entity that doesn't have it", async () => {
      const error = new CommandError(
        'revoke',
        `grantee ${DAO.voting} doesn't have the given permission`,
      );
      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            'revoke voting token-manager ISSUE_ROLE',
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
