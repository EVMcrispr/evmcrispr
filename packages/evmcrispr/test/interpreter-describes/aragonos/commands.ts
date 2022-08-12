import { expect } from 'chai';
import type { Signer } from 'ethers';
import { constants, utils } from 'ethers';
import { ethers } from 'hardhat';

import type { Action } from '../../../src';
import { encodeActCall } from '../../../src';
import { BindingsSpace } from '../../../src/cas11/interpreter/BindingsManager';

import type { AragonOS } from '../../../src/cas11/modules/aragonos/AragonOS';
import {
  MINIME_TOKEN_FACTORIES,
  getAragonRegistrarContract,
  getRepoContract,
} from '../../../src/cas11/modules/aragonos/utils';
import {
  ComparisonType,
  buildArgsLengthErrorMsg,
  commaListItems,
} from '../../../src/cas11/utils';
import { CommandError } from '../../../src/errors';
import {
  ANY_ENTITY,
  addressesEqual,
  buildNonceForAddress,
  calculateNewProxyAddress,
  getAragonEnsResolver,
  resolveName,
  toDecimals,
} from '../../../src/utils';

import { APP, DAO } from '../../fixtures';
import {
  createTestAction,
  // createTestCallAction,
  createTestScriptEncodedAction,
} from '../../test-helpers/actions';

import { createInterpreter } from '../../test-helpers/cas11';
import { expectThrowAsync } from '../../test-helpers/expects';

const _aragonEns = async (
  ensName: string,
  module: AragonOS,
): Promise<string | null> => {
  const ensResolver = module.getModuleBinding('ensResolver', true);

  const name = await resolveName(
    ensName,
    ensResolver || getAragonEnsResolver(await module.signer.getChainId()),
    module.signer,
  );

  return name;
};

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
            dao!.resolveApp(appIdentifier)!.address,
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

    describe('grant <entity> <app> <role> [permissionManager]', () => {
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
          `grantee must be a valid address, got ${toDecimals(
            1,
            18,
          ).toString()}`,
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

        error = new CommandError(
          'revoke',
          `${nonAppAddress} is not a DAO's app`,
        );

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

    describe('forward <...path> <commandsBlock>', () => {
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
          `App ${DAO.finance} is not a forwarder.`,
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

    describe('upgrade <apmRepo> [newAppImplementationAddress]', () => {
      it('should upgrade an app to the latest version', async () => {
        const interpreter = createAragonScriptInterpreter([`upgrade voting`]);

        const upgradeActions = await interpreter.interpret();

        const repoAddress = await _aragonEns(
          'voting.aragonpm.eth',
          interpreter.getModule('aragonos') as AragonOS,
        );
        const repo = getRepoContract(repoAddress!, signer);
        const [, latestImplementationAddress] = await repo.getLatest();
        const expectedUpgradeActions = [
          createTestAction('setApp', DAO.kernel, [
            utils.id('base'),
            utils.namehash('voting.aragonpm.eth'),
            latestImplementationAddress,
          ]),
        ];

        expect(upgradeActions).to.eql(expectedUpgradeActions);
      });

      it('should upgrade an app to the provided specific version', async () => {
        const interpreter = createAragonScriptInterpreter([
          `upgrade voting 3.0.3`,
        ]);

        const upgradeActions = await interpreter.interpret();

        const repoAddress = await _aragonEns(
          'voting.aragonpm.eth',
          interpreter.getModule('aragonos') as AragonOS,
        );
        const repo = getRepoContract(repoAddress!, signer);
        const [, newAppImplementation] = await repo.getBySemanticVersion([
          '3',
          '0',
          '3',
        ]);
        const expectedUpgradeActions = [
          createTestAction('setApp', DAO.kernel, [
            utils.id('base'),
            utils.namehash('voting.aragonpm.eth'),
            newAppImplementation,
          ]),
        ];

        expect(upgradeActions).to.eql(expectedUpgradeActions);
      });

      it('should fail when executing it outside a "connect" command', async () => {
        const error = new CommandError(
          'upgrade',
          'must be used within a "connect" command',
        );
        await expectThrowAsync(
          () =>
            createInterpreter(
              `
            load aragonos as ar

            ar:upgrade voting
          `,
              signer,
            ).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when upgrading a non-existent app', async () => {
        const apmRepo = 'superfluid.open';
        const error = new CommandError(
          'upgrade',
          `${apmRepo}.aragonpm.eth not installed on current DAO.`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([`upgrade ${apmRepo}`]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when providing an invalid second parameter', async () => {
        const error = new CommandError(
          'upgrade',
          'second upgrade parameter must be a semantic version, an address, or nothing',
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter(['upgrade voting 1e18']).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when upgrading an app to the same version', async () => {
        const error = new CommandError(
          'upgrade',
          `trying to upgrade app to its current version`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter(['upgrade voting 2.3.0']).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });
    });

    describe('new-dao <daoName>', () => {
      it('should create a new dao correctly', async () => {
        const daoName = 'my-evmcrispr-dao';
        const interpreter = createInterpreter(
          `
          load aragonos as ar

          ar:new-dao ${daoName}
        `,
          signer,
        );

        const newDAOActions = await interpreter.interpret();

        const aragonos = interpreter.getModule('aragonos') as AragonOS;
        const bareTemplateAddress = (await _aragonEns(
          'bare-template.aragonpm.eth',
          aragonos,
        ))!;
        const aragonRegistrar = await getAragonRegistrarContract(
          signer.provider!,
        );
        const newDAOAddress = calculateNewProxyAddress(
          bareTemplateAddress,
          await buildNonceForAddress(
            bareTemplateAddress,
            0,
            aragonos.signer.provider!,
          ),
        );
        const expectedNewDAOActions: Action[] = [
          createTestAction('newInstance', bareTemplateAddress!),
          {
            to: aragonRegistrar.address,
            data: aragonRegistrar.interface.encodeFunctionData('register', [
              utils.solidityKeccak256(['string'], [daoName]),
              newDAOAddress,
            ]),
          },
        ];

        expect(
          aragonos.bindingsManager.getBinding(
            `_${daoName}`,
            BindingsSpace.ADDR,
          ),
          'new DAO binding mismatch',
        ).to.eq(newDAOAddress);
        expect(newDAOActions, 'actions mismatch').to.eql(expectedNewDAOActions);
      });
    });

    describe('new-token <name> <symbol> <controller> [decimals = 18] [transferable = true]', () => {
      it('should create a new token correctly', async () => {
        const params = [
          'my-token',
          'MT',
          'token-manager.open:counter-factual-tm',
        ];

        const interpreter = await createAragonScriptInterpreter([
          `new-token ${params.join(' ')}`,
          // `in`,
        ]);

        const newTokenActions = await interpreter.interpret();

        const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(
          await signer.getChainId(),
        )!;

        const newTokenAddress = calculateNewProxyAddress(
          tokenFactoryAddress,
          await buildNonceForAddress(tokenFactoryAddress, 0, signer.provider!),
        );

        const expectedNewTokenActions = [
          createTestAction(
            'createCloneToken',
            MINIME_TOKEN_FACTORIES.get(await signer.getChainId())!,
            [constants.AddressZero, 0, params[0], 18, params[1], true],
          ),
          createTestAction('changeController', newTokenAddress, [
            calculateNewProxyAddress(
              DAO.kernel,
              await buildNonceForAddress(DAO.kernel, 0, signer.provider!),
            ),
          ]),
        ];

        expect(newTokenActions).to.eql(expectedNewTokenActions);
      });

      it('should fail when executing it outside a "connect" command', async () => {
        const error = new CommandError(
          'new-token',
          'must be used within a "connect" command',
        );

        await expectThrowAsync(
          () =>
            createInterpreter(
              `
              load aragonos as ar

              ar:new-token "a new token" ANT token-manager.open:counter-factual-tm
            `,
              signer,
            ).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing an invalid token decimals value', async () => {
        const invalidDecimals = 'invalidDecimals';
        const error = new CommandError(
          'new-token',
          `invalid decimals. Expected an integer number, but got ${invalidDecimals}`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `new-token "a new token" ANT token-manager.open:counter-factual-tm ${invalidDecimals}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing an invalid controller', async () => {
        const invalidController = 'asd:123-asd&45';
        const error = new CommandError(
          'new-token',
          `invalid controller. Expected an address or an app identifier, but got ${invalidController}`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `new-token "a new token" ANT ${invalidController}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing an invalid transferable flag', async () => {
        const invalidTransferable = 'an-invalid-value';
        const error = new CommandError(
          'new-token',
          `invalid transferable flag. Expected a boolean, but got ${invalidTransferable}`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `new-token "a new token" ANT token-manager.open:counter-factual-tm 18 ${invalidTransferable}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });
    });

    describe('install <repo> [initParams]', () => {
      const {
        appId,
        appIdentifier,
        codeAddress,
        initializeParams,
        initializeUnresolvedParams,
        initializeSignature,
      } = APP;
      const newAppIdentifier = `${appIdentifier}:new-app`;

      it('should install a new app correctly', async () => {
        const interpreter = createAragonScriptInterpreter([
          `install ${newAppIdentifier} ${initializeUnresolvedParams.join(' ')}`,
        ]);

        const installationActions = await interpreter.interpret();

        const expectedInstallationActions: Action[] = [
          createTestAction('newAppInstance', DAO.kernel, [
            appId,
            codeAddress,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        ];
        const aragonos = interpreter.getModule('aragonos') as AragonOS;
        const dao = aragonos.connectedDAOs[0];
        const installedApp = dao.resolveApp(newAppIdentifier);

        expect(installedApp, 'DAO does not have installed app').to.exist;
        expect(
          addressesEqual(installedApp!.codeAddress, codeAddress),
          'wrong installed app version',
        ).to.be.true;
        expect(installationActions, 'installation actions mismatch').to.eql(
          expectedInstallationActions,
        );
      });

      it('should install a given version of an app correctly', async () => {
        const specificVersion = '0xe775468f3ee275f740a22eb9dd7adba9b7933aa0';
        const interpreter = createAragonScriptInterpreter([
          `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
            ' ',
          )} --version 2.2.0`,
        ]);

        const installationActions = await interpreter.interpret();

        const aragonos = interpreter.getModule('aragonos') as AragonOS;
        const dao = aragonos.getConnectedDAO(DAO.kernel)!;
        const installedApp = dao.resolveApp(newAppIdentifier);

        const expectedInstallationActions = [
          createTestAction('newAppInstance', DAO.kernel, [
            appId,
            specificVersion,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        ];

        expect(installedApp, ' DAO does not have installed app').to.exist;
        expect(
          addressesEqual(installedApp!.codeAddress, specificVersion),
          'wrong installed app version',
        ).to.be.true;
        expect(installationActions, 'installation actions mismatch').to.eql(
          expectedInstallationActions,
        );
      });

      it('should fail when executing it outside a "connect" command', async () => {
        const error = new CommandError(
          'install',
          `must be used within a "connect" command`,
        );

        await expectThrowAsync(
          () =>
            createInterpreter(
              `
            load aragonos as ar

            ar:install ${newAppIdentifier} ${initializeUnresolvedParams.join(
                ' ',
              )}
          `,
              signer,
            ).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail passing an invalid repo identifier', async () => {
        const invalidRepoIdentifier = `missing-label-repo`;
        const error = new CommandError(
          'install',
          `invalid labeled identifier ${invalidRepoIdentifier}`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `install ${invalidRepoIdentifier} ${initializeUnresolvedParams.join(
                ' ',
              )}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing a repo that can not be resolved', async () => {
        const invalidRepoENSName = `non-existent-repo:new-app`;
        const error = new CommandError(
          'install',
          `ENS repo name ${
            invalidRepoENSName.split(':')[0] + '.aragonpm.eth'
          } couldn't be resolved`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `install ${invalidRepoENSName} ${initializeUnresolvedParams.join(
                ' ',
              )}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing an invalid --version option', async () => {
        const invalidVersion = '1e18';
        const error = new CommandError(
          'install',
          `invalid --version option. Expected a semantic version, but got 1000000000000000000`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
                ' ',
              )} --version ${invalidVersion}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when installing an app with an identifier previously used', async () => {
        const error = new CommandError(
          'install',
          `identifier ${newAppIdentifier} is already in use.`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
                ' ',
              )}`,
              `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
                ' ',
              )}`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });

      it('should fail when passing invalid initialize params', async () => {
        const paramsErrors = [
          '-param _token of type address: invalid address. Got 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a',
          '-param _maxAccountTokens of type uint256: invalid BigNumber value. Got false',
        ];
        const error = new CommandError(
          'install',
          `error when encoding initialize call:\n${paramsErrors.join('\n')}`,
        );

        await expectThrowAsync(
          () =>
            createAragonScriptInterpreter([
              `install ${newAppIdentifier} 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a 1e18 false`,
            ]).interpret(),
          {
            type: error.constructor,
            message: error.message,
          },
        );
      });
    });
  });
