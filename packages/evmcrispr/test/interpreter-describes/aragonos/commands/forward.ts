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
import { createAragonScriptInterpreter as createAragonScriptInterpreter_ } from '../../../test-helpers/aragonos';
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

    it('should forward a set of command actions correctly', async () => {
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

    it('should fail when forwarding actions through invalid forwarder addresses', async () => {
      const invalidAddresses = [
        'an-unresolvedIdentifier',
        '0x14FA5C16325f56190239B997485656F5c8b4f86c422b',
      ];
      const error = new CommandError(
        'forward',
        `invalid addresses found for the following forwarders: ${commaListItems(
          invalidAddresses.map((i, index) => `${i} (${index + 1})`),
        )}`,
      );
      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `forward ${invalidAddresses.join(' ')} (
          grant tollgate.open finance CREATE_PAYMENTS_ROLE
        )`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when forwarding actions through non-forwarder entities', async () => {
      const error = new CommandError(
        'forward',
        `app ${DAO.finance} is not a forwarder`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `forward token-manager finance (
        grant tollgate.open finance CREATE_PAYMENTS_ROLE
      )`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
