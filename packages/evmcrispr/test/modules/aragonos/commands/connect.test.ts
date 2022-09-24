import { expect } from 'chai';
import type { Signer } from 'ethers';
import { constants, utils } from 'ethers';
import { ethers } from 'hardhat';

import type { AragonOS } from '../../../../src/modules/aragonos/AragonOS';

import {
  ANY_ENTITY,
  MINIME_TOKEN_FACTORIES,
} from '../../../../src/modules/aragonos/utils';
import {
  ComparisonType,
  buildArgsLengthErrorMsg,
  buildNonceForAddress,
  calculateNewProxyAddress,
  encodeCalldata,
  toDecimals,
} from '../../../../src/utils';
import { CommandError } from '../../../../src/errors';

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
import { DAO as DAO2 } from '../../../fixtures/mock-dao-2';
import { DAO as DAO3 } from '../../../fixtures/mock-dao-3';
import {
  createTestAction,
  createTestPreTxAction,
  createTestScriptEncodedAction,
} from '../../../test-helpers/actions';
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from '../../../test-helpers/aragonos';

import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

const DAOs = [DAO, DAO2, DAO3];

describe('AragonOS > commands > connect <daoNameOrAddress> [...appsPath] <commandsBlock> [--context <contextInfo>]', () => {
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

  it('should set connected DAO variable', async () => {
    const interpreter = createAragonScriptInterpreter();
    await interpreter.interpret();
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel);

    expect(dao).to.not.be.null;
    expect(dao!.nestingIndex, 'DAO nested index mismatch').to.equals(1);
    Object.entries(DAO).forEach(([appIdentifier, appAddress]) => {
      expect(
        dao!.resolveApp(appIdentifier)!.address,
        `${appIdentifier} binding mismatch`,
      ).equals(appAddress);
    });
  });

  describe('when having nested connect commands', () => {
    it('should set all the connected DAOs properly', async () => {
      const interpreter = createInterpreter(
        `
          load aragonos as ar

          ar:connect ${DAO.kernel} (
            connect ${DAO2.kernel} (
              std:set $var1 1
              connect ${DAO3.kernel} (
                std:set $var2 token-manager
              )
            )
          )
        `,
        signer,
      );

      await interpreter.interpret();

      const aragonos = interpreter.getModule('aragonos') as AragonOS;
      const daos = aragonos.connectedDAOs;

      expect(daos, 'connected DAOs length mismatch').to.be.lengthOf(3);

      let i = 0;
      for (const dao of daos) {
        expect(dao.nestingIndex, `DAO ${i} nesting index mismatch`).to.equals(
          i + 1,
        );
        Object.entries(DAOs[i]).forEach(([appIdentifier, appAddress]) => {
          expect(
            dao!.resolveApp(appIdentifier)!.address,
            `DAO ${i} ${appIdentifier} binding mismatch`,
          ).equals(appAddress);
        });
        i++;
      }
    });

    it('should return the correct actions when using app identifiers from different DAOs', async () => {
      const interpreter = createInterpreter(
        `
          load aragonos as ar

          ar:connect ${DAO.kernel} (
            connect ${DAO2.kernel} (
              grant voting _1:voting CREATE_VOTES_ROLE
              connect ${DAO3.kernel} (
                grant _1:voting _${DAO2.kernel}:token-manager ISSUE_ROLE voting
              )
            )
            
          )
        `,
        signer,
      );

      const nestedActions = await interpreter.interpret();

      const expectedNestedActions = [
        createTestAction('grantPermission', DAO.acl, [
          DAO2.voting,
          DAO.voting,
          utils.id('CREATE_VOTES_ROLE'),
        ]),
        createTestAction('createPermission', DAO2.acl, [
          DAO.voting,
          DAO2['token-manager'],
          utils.id('ISSUE_ROLE'),
          DAO3.voting,
        ]),
      ];

      expect(nestedActions).to.eql(expectedNestedActions);
    });

    it('should fail when trying to connect to an already connected DAO', async () => {
      const interpreter = createInterpreter(
        `
      load aragonos as ar

      ar:connect ${DAO.kernel} (
        connect ${DAO.kernel} (

        )
      )
      `,
        signer,
      );

      const connectNode = findAragonOSCommandNode(
        interpreter.ast,
        'connect',
        1,
      )!;
      const error = new CommandError(
        connectNode,
        `trying to connect to an already connected DAO (${DAO.kernel})`,
      );
      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  });

  it('should fail when forwarding a set of actions through a context forwarder without defining a context', async () => {
    const interpreter = createInterpreter(
      `
      load aragonos as ar

      ar:connect ${DAO.kernel} disputable-voting.open (
        grant voting token-manager ISSUE_ROLE voting
      )
    `,
      signer,
    );
    const c = findAragonOSCommandNode(interpreter.ast, 'connect')!;
    const error = new CommandError(c, `context option missing`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when not passing a commands block', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos as ar
    ar:connect ${DAO.kernel}
  `,
      signer,
    );
    const c = findAragonOSCommandNode(interpreter.ast, 'connect')!;
    const error = new CommandError(
      c,
      buildArgsLengthErrorMsg(1, {
        type: ComparisonType.Greater,
        minValue: 2,
      }),
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
