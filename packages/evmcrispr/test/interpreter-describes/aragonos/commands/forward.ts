import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { commaListItems } from '../../../../src/cas11/utils';
import { CommandError } from '../../../../src/errors';

import { ANY_ENTITY } from '../../../../src/utils';

import { DAO } from '../../../fixtures';
import {
  createTestAction,
  createTestScriptEncodedAction,
} from '../../../test-helpers/actions';
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from '../../../test-helpers/aragonos';
import {
  createInterpreter,
  itChecksNonDefinedIdentifier,
} from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const forwardDescribe = (): Suite =>
  describe('forward <...path> <commandsBlock>', () => {
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

    it('should return a correct forward action', async () => {
      const interpreter = createAragonScriptInterpreter([
        `
      forward token-manager:0 voting (
        grant finance token-manager ISSUE_ROLE voting
        revoke ANY_ENTITY tollgate.open CHANGE_DESTINATION_ROLE true
      )
    `,
      ]);

      const forwardActions = await interpreter.interpret();

      const expectedActions = [
        createTestScriptEncodedAction(
          [
            createTestAction('createPermission', DAO.acl, [
              DAO.finance,
              DAO['token-manager'],
              utils.id('ISSUE_ROLE'),
              DAO.voting,
            ]),
            createTestAction('revokePermission', DAO.acl, [
              ANY_ENTITY,
              DAO['tollgate.open'],
              utils.id('CHANGE_DESTINATION_ROLE'),
            ]),
            createTestAction('removePermissionManager', DAO.acl, [
              DAO['tollgate.open'],
              utils.id('CHANGE_DESTINATION_ROLE'),
            ]),
          ],
          ['token-manager', 'voting'],
        ),
      ];

      expect(forwardActions).to.eql(expectedActions);
    });

    itChecksNonDefinedIdentifier(
      'should fail when receiving non-defined forwarder identifiers',
      (nonDefinedIdentifier) =>
        createInterpreter(
          `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          forward ${nonDefinedIdentifier} (
            grant tollgate.open finance CREATE_PAYMENTS_ROLE
          )
        )
      `,
          signer,
        ),
    );

    it('should fail when forwarding actions through invalid forwarder addresses', async () => {
      const invalidAddresses = [
        'false',
        '0xab123cd1231255ab45323de234223422a12312321abaceff',
      ];
      const interpreter = createAragonScriptInterpreter([
        `forward ${invalidAddresses.join(' ')} (
      grant tollgate.open finance CREATE_PAYMENTS_ROLE
    )`,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, 'forward')!;
      const error = new CommandError(
        c,
        `${commaListItems(invalidAddresses)} are not valid forwarder address`,
      );
      await expectThrowAsync(() => interpreter.interpret(), error);
    });

    it('should fail when forwarding actions through non-forwarder entities', async () => {
      const interpreter = createAragonScriptInterpreter([
        `forward token-manager finance (
    grant tollgate.open finance CREATE_PAYMENTS_ROLE
  )`,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, 'forward')!;
      const error = new CommandError(
        c,
        `app ${DAO.finance} is not a forwarder`,
      );

      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  });
