import { expect } from 'chai';
import type { Signer } from 'ethers';
import { constants, utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { AragonOS } from '../../../../src/cas11/modules/aragonos/AragonOS';

import { MINIME_TOKEN_FACTORIES } from '../../../../src/cas11/modules/aragonos/utils';
import {
  ComparisonType,
  buildArgsLengthErrorMsg,
  encodeCalldata,
} from '../../../../src/cas11/utils';
import { CommandError } from '../../../../src/errors';
import {
  ANY_ENTITY,
  buildNonceForAddress,
  calculateNewProxyAddress,
  toDecimals,
} from '../../../../src/utils';

import {
  APP,
  COMPLETE_FORWARDER_PATH,
  CONTEXT,
  DAO,
  FEE_AMOUNT,
  FEE_FORWARDER,
  FEE_TOKEN_ADDRESS,
  resolveApp,
} from '../../../fixtures';
import {
  createTestAction,
  createTestPreTxAction,
  createTestScriptEncodedAction,
} from '../../../test-helpers/actions';
import { createAragonScriptInterpreter as createAragonScriptInterpreter_ } from '../../../test-helpers/aragonos';

import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const connectDescribe = (): Suite =>
  describe('connect <daoNameOrAddress> [...appsPath] <commandsBlock> [--context <contextInfo>]', () => {
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

    it('should return the correct actions when defining a complete forwarding path compose of a fee, normal and context forwarder', async () => {
      const interpreter = createInterpreter(
        `
        load aragonos as ar

        ar:connect ${DAO.kernel} ${COMPLETE_FORWARDER_PATH.join(
          ' ',
        )} --context "${CONTEXT}" (
          grant @me vault TRANSFER_ROLE
          grant disputable-voting.open token-manager ISSUE_ROLE voting
          revoke ANY_ENTITY tollgate.open CHANGE_AMOUNT_ROLE true
          new-token "Other Token" OT token-manager:new
          install token-manager:new token:OT true 0
          act agent vault "transfer(address,address,uint256)" @token(DAI) @me 10.50e18
        )
      `,
        signer,
      );

      const forwardingAction = await interpreter.interpret();

      const me = await signer.getAddress();
      const chainId = await signer.getChainId();
      const { appId, codeAddress, initializeSignature } = APP;
      const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(
        await signer.getChainId(),
      )!;
      const newTokenAddress = calculateNewProxyAddress(
        tokenFactoryAddress,
        await buildNonceForAddress(tokenFactoryAddress, 0, signer.provider!),
      );

      const expectedForwardingActions = [
        createTestPreTxAction('approve', FEE_TOKEN_ADDRESS, [
          resolveApp(FEE_FORWARDER),
          FEE_AMOUNT,
        ]),
        createTestScriptEncodedAction(
          [
            createTestAction('grantPermission', DAO.acl, [
              me,
              DAO.vault,
              utils.id('TRANSFER_ROLE'),
            ]),
            createTestAction('createPermission', DAO.acl, [
              DAO['disputable-voting.open'],
              DAO['token-manager'],
              utils.id('ISSUE_ROLE'),
              DAO.voting,
            ]),
            createTestAction('revokePermission', DAO.acl, [
              ANY_ENTITY,
              DAO['tollgate.open'],
              utils.id('CHANGE_AMOUNT_ROLE'),
            ]),
            createTestAction('removePermissionManager', DAO.acl, [
              DAO['tollgate.open'],
              utils.id('CHANGE_AMOUNT_ROLE'),
            ]),
            createTestAction(
              'createCloneToken',
              MINIME_TOKEN_FACTORIES.get(chainId)!,
              [constants.AddressZero, 0, 'Other Token', 18, 'OT', true],
            ),
            createTestAction('changeController', newTokenAddress, [
              calculateNewProxyAddress(
                DAO.kernel,
                await buildNonceForAddress(DAO.kernel, 0, signer.provider!),
              ),
            ]),
            createTestAction('newAppInstance', DAO.kernel, [
              appId,
              codeAddress,
              encodeCalldata(
                new utils.Interface([`function ${initializeSignature}`]),
                'initialize',
                [newTokenAddress, true, 0],
              ),
              false,
            ]),
            createTestScriptEncodedAction(
              [
                {
                  to: DAO.vault,
                  data: new utils.Interface([
                    'function transfer(address,address,uint256)',
                  ]).encodeFunctionData('transfer', [
                    '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
                    me,
                    toDecimals('10.50'),
                  ]),
                },
              ],
              ['agent'],
            ),
          ],
          COMPLETE_FORWARDER_PATH,
          CONTEXT,
        ),
      ];

      expect(forwardingAction).to.eqls(expectedForwardingActions);
    });

    it('should set dao global binding', async () => {
      const interpreter = createAragonScriptInterpreter();
      await interpreter.interpret();
      const aragonos = interpreter.getModule('aragonos') as AragonOS;
      const dao = aragonos.getConnectedDAO(DAO.kernel);

      expect(dao).to.not.be.null;
      expect(dao!.nestingIndex, 'DAO nested index mismatch').to.equals(0);
      Object.entries(DAO).forEach(([appIdentifier, appAddress]) => {
        expect(
          dao!.resolveApp(appIdentifier)!.address,
          `${appIdentifier} binding mismatch`,
        ).equals(appAddress);
      });
    });

    it('should fail when forwarding a set of actions through a context forwarder without defining a context', async () => {
      const error = new CommandError('connect', `context option missing`);

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
          load aragonos as ar

          ar:connect ${DAO.kernel} disputable-voting.open (
            grant voting token-manager ISSUE_ROLE voting
          )
        `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should interpret nested commands');

    it('should fail when not passing a commands block', async () => {
      const error = new CommandError(
        'connect',
        buildArgsLengthErrorMsg(1, {
          type: ComparisonType.Greater,
          minValue: 2,
        }),
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        load aragonos as ar
        ar:connect ${DAO.kernel}
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when trying to connect to an already connected DAO', async () => {
      const error = new CommandError(
        'connect',
        `trying to connect to an already connected DAO (${DAO.kernel})`,
      );
      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO.kernel} (

          )
        )
        `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
