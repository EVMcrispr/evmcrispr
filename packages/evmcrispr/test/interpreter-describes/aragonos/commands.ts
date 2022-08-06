import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import { ErrorException, ErrorInvalid, ErrorNotFound } from '../../../src';
import { buildErrorMsg } from '../../../src/cas11/interpreter/Interpreter';

import type { AragonOS } from '../../../src/cas11/modules/aragonos/AragonOS';
import {
  CallableExpression,
  ComparisonType,
  buildArgsLengthErrorMsg,
} from '../../../src/cas11/utils';
import { ANY_ENTITY, toDecimals } from '../../../src/utils';

import { DAO } from '../../fixtures';
import {
  createTestAction,
  // createTestCallAction,
  createTestScriptEncodedAction,
} from '../../test-helpers/actions';

import { createInterpreter } from '../../test-helpers/cas11';
import { expectThrowAsync } from '../../test-helpers/expects';

const { Command } = CallableExpression;

export const commandsDescribe = (): Mocha.Suite =>
  describe('Commands', () => {
    let signer: Signer;

    const createAragonScriptInterpreter = (commands: string[] = []) => {
      return createInterpreter(
        `
      load aragonos as ar
      ar:connect ${DAO.kernel} (
        ${commands.join('\n')}
      )
    `,
        signer,
      );
    };

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    describe('connect <daoNameOrAddress> [...appsPath] <commandsBlock>', () => {
      it('should set dao global binding', async () => {
        const interpreter = createAragonScriptInterpreter();
        await interpreter.interpret();
        const aragonos = interpreter.getModule('aragonos') as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel);

        expect(dao).to.not.be.null;
        expect(dao!.nestingIndex, 'DAO nested index mismatch').to.equals(0);
        Object.entries(DAO).forEach(([appIdentifier, appAddress]) => {
          expect(
            dao!.resolveApp(appIdentifier).address,
            `${appIdentifier} binding mismatch`,
          ).equals(appAddress);
        });
      });

      it('should wrap block commands inside a forwarding action when forwader apps are provided', async () => {
        const interpreter = createInterpreter(
          `
          load aragonos as ar

          ar:connect ${DAO.kernel} token-manager voting (
            grant @me vault TRANSFER_ROLE
          )
        `,
          signer,
        );

        const forwardingAction = await interpreter.interpret();
        const expectedForwardingActions = [
          createTestScriptEncodedAction(
            [
              createTestAction('grantPermission', DAO.acl, [
                await signer.getAddress(),
                DAO.vault,
                utils.id('TRANSFER_ROLE'),
              ]),
            ],
            ['token-manager', 'voting'],
          ),
        ];

        expect(forwardingAction).to.eqls(expectedForwardingActions);
      });

      it('should interpret nested commands');

      it('should fail when not passing a commands block', async () => {
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
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'connect',
              buildArgsLengthErrorMsg(1, {
                type: ComparisonType.Greater,
                minValue: 2,
              }),
            ),
          },
        );
      });

      it('should fail when trying to connect to an already connected DAO', async () => {
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
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'connect',
              `trying to connect to an already connected DAO (${DAO.kernel})`,
            ),
          },
        );
      });
    });

    // describe('act <agent> <methodSignature> [...params]', () => {
    //   it('should interpret a valid command correctly', async () => {
    //     const interpreter = createInterpreter(
    //       createAragonScript([
    //         `act vault vault "deposit(uint,uint[][])" 1 [[2,3],[4,5]]`,
    //       ]),
    //       signer,
    //     );

    //     const actions = await interpreter.interpret();
    //     const expectedActActions = [
    //       createTestScriptEncodedAction(
    //         [
    //           createTestCallAction(DAO.vault, 'deposit(uint,uint[][])', [
    //             1,
    //             [
    //               [2, 3],
    //               [4, 5],
    //             ],
    //           ]),
    //         ],
    //         ['vault'],
    //       ),
    //     ];

    //     expect(actions).to.be.eql(expectedActActions);
    //   });
    // });

    describe('grant <entity> <app> <role> [permissionManager]', async () => {
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
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'grant',
              'must be used within a "connect" command',
            ),
          },
        );
      });

      it('should fail when granting an unknown permission', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'grant voting token-manager UNKNOWN_ROLE',
            ]).interpret(),
          {
            type: ErrorException,
            message: buildErrorMsg(
              Command,
              'grant',
              "given permission doesn't exists on app token-manager",
            ),
          },
        );
      });

      it('should fail when granting a permission to an address that already has it', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'grant voting token-manager ISSUE_ROLE',
            ]).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'grant',
              'permission manager missing',
            ),
          },
        );
      });

      it('should fail when creating a permission without a permission manager', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'grant voting token-manager ISSUE_ROLE',
            ]).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'grant',
              'permission manager missing',
            ),
          },
        );
      });

      it('should fail when creating a permission with an invalid permission manager', async () => {
        const invalidPermissionManager = 'invalidPermissionManager';
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `grant voting token-manager ISSUE_ROLE "${invalidPermissionManager}"`,
            ]).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'grant',
              `invalid permission manager. Expected an address, but got ${invalidPermissionManager}`,
            ),
          },
        );
      });
    });

    describe('revoke <grantee> <app> <role> [removeManager]', () => {
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
        await expectThrowAsync(
          () =>
            createInterpreter(
              `
              load aragonos as ar
              ar:revoke voting token-manager MINT_ROLE`,
              signer,
            ).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'revoke',
              'must be used within a "connect" command',
            ),
          },
        );
      });
      it('should fail when passing an invalid grantee address', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'revoke 1e18 token-manager MINT_ROLE',
            ]).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'revoke',
              `grantee must be a valid address, got ${toDecimals(
                1,
                18,
              ).toString()}`,
            ),
          },
        );
      });
      it('should fail when passing an invalid remove manager flag', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'revoke voting token-manager MINT_ROLE 1e18',
            ]).interpret(),
          {
            type: ErrorInvalid,
            message: buildErrorMsg(
              Command,
              'revoke',
              `invalid remove manager flag. Expected boolean but got ${typeof toDecimals(
                1,
                18,
              )}`,
            ),
          },
        );
      });
      it('should fail when revoking a permission from a non-app entity', async () => {
        const nonAppAddress = await signer.getAddress();
        const unknownIdentifier = 'unknown-app.open';
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `revoke voting ${unknownIdentifier} A_ROLE`,
            ]).interpret(),
          {
            type: ErrorNotFound,
            message: `app ${unknownIdentifier}:0 not found.`,
            name: 'ErrorAppNotFound',
          },
          `Unknown identifier didn't fail properly`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `revoke voting ${nonAppAddress} MY_ROLE`,
            ]).interpret(),
          {
            type: ErrorNotFound,
            name: 'ErrorAppNotFound',
            message: `address ${nonAppAddress} doesn't match any app.`,
          },
        );
      });
      it('should fail when revoking a non-existent permission', async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'revoke voting token-manager UNKNOWN_ROLE',
            ]).interpret(),
          {
            type: ErrorNotFound,
            message: buildErrorMsg(
              Command,
              'revoke',
              `given permission doesn't exists on app token-manager`,
            ),
          },
        );
      });
      it("should fail when revoking a permission from an entity that doesn't have it", async () => {
        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              'revoke voting token-manager ISSUE_ROLE',
            ]).interpret(),
          {
            type: ErrorNotFound,
            message: buildErrorMsg(
              Command,
              'revoke',
              `grantee ${DAO.voting} doesn't have the given permission`,
            ),
          },
        );
      });
    });
  });
