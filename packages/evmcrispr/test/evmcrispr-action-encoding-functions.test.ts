import { ethers } from 'hardhat';
import { addressesEqual } from '@1hive/connect';
import { utils } from 'ethers';
import { expect } from 'chai';

import { ErrorException, ErrorInvalid, ErrorNotFound } from '../src/errors';
import type { Action, Permission } from '../src/types';
import { encodeActCall, encodeCallScript } from '../src/helpers';
import {
  APP,
  DAO,
  EOA_ADDRESS,
  GRANT_PERMISSIONS,
  GRANT_PERMISSION_PARAMS,
  MockEVMcrispr,
  NEW_PERMISSIONS,
  NEW_PERMISSION_PARAMS,
  PERMISSION_MANAGER,
  REVOKE_PERMISSIONS,
  resolvePermission,
} from './fixtures';
import { expectThrowAsync, isValidIdentifier } from './test-helpers/expects';

describe('EVMcrispr action-encoding functions', () => {
  let evmcrispr: MockEVMcrispr;

  beforeEach(async () => {
    const signer = (await ethers.getSigners())[0];

    evmcrispr = await MockEVMcrispr.create(DAO.kernel, signer);
  });

  const testBadPermission = (
    evmcrisprPermissionMethod: (badPermission: Permission) => any,
  ) => {
    it(
      "fails when receiving an invalid identifier as the permission's grantee",
      isValidIdentifier(
        (badIdentifier) =>
          evmcrisprPermissionMethod([
            badIdentifier,
            'token-manager',
            'MINT_ROLE',
          ]),
        false,
        false,
      ),
    );

    it(
      'fails when receiving an invalid identifier as the app holding the permission',
      isValidIdentifier(
        (badIdentifier) =>
          evmcrisprPermissionMethod(['voting', badIdentifier, 'MINT_ROLE']),
        false,
        false,
      ),
    );

    it("fails when receiving a permission holder app address that doesn't match any DAO app", async () => {
      await expectThrowAsync(
        evmcrisprPermissionMethod(['voting', EOA_ADDRESS, 'ROLE']),
        {
          type: ErrorNotFound,
          name: 'ErrorAppNotFound',
        },
      );
    });

    it('fails when receiving an invalid hash role', async () => {
      await expectThrowAsync(
        evmcrisprPermissionMethod([
          'voting',
          'token-manager',
          '0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c366',
        ]),
        { type: ErrorInvalid, name: 'ErrorInvalidRole' },
        'Invalid hash role',
      );
    });

    it('fails when receiving a non-existent role', async () => {
      await expectThrowAsync(
        evmcrisprPermissionMethod([
          'voting',
          'token-manager',
          'NON_EXISTENT_ROLE',
        ]),
        {
          type: ErrorNotFound,
        },
      );
    });
  };

  describe('grant()', () => {
    testBadPermission((badPermission) =>
      evmcrispr.grant(badPermission, 'voting'),
    );

    it(
      'fails when receiving an invalid identifier as the permission manager',
      isValidIdentifier(
        (badIdentifier) =>
          evmcrispr.grant(
            ['voting', 'token-manager', 'MINT_ROLE'],
            badIdentifier,
          ),
        false,
        false,
      ),
    );

    it('fails when granting a permission to the same entity twice', async () => {
      await expectThrowAsync(
        evmcrispr.grant(['voting', 'token-manager', 'MINT_ROLE'], 'voting'),
        {
          type: ErrorException,
        },
      );
    });

    it('encodes a create permission action correctly', async () => {
      const newPermission = NEW_PERMISSIONS[0];
      const expectedCreatePermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall(
            'createPermission(address,address,bytes32,address)',
            [
              ...resolvePermission(newPermission),
              DAO[PERMISSION_MANAGER as keyof typeof DAO],
            ],
          ),
        },
      ];
      const encodedCreatePermissionAction = await evmcrispr.grant(
        newPermission,
        PERMISSION_MANAGER,
      )();

      expect(expectedCreatePermissionAction).eql(encodedCreatePermissionAction);
    });

    it('encodes a grant permission action when permission already exists', async () => {
      const grantPermission = GRANT_PERMISSIONS[0];
      const expectedGrantPermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall(
            'grantPermission(address,address,bytes32)',
            resolvePermission(grantPermission),
          ),
        },
      ];
      const encodedGrantPermissionAction = await evmcrispr.grant(
        grantPermission,
        PERMISSION_MANAGER,
      )();

      expect(expectedGrantPermissionAction).eql(encodedGrantPermissionAction);
    });

    it('encodes a grant permission action with parameters when permission already exists', async () => {
      const expectedGrantPermissionAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall(
            'grantPermissionP(address,address,bytes32,uint256[])',
            [
              ...resolvePermission(GRANT_PERMISSIONS[0]),
              GRANT_PERMISSION_PARAMS[3](),
            ],
          ),
        },
      ];
      const encodedGrantPermissionAction = await evmcrispr.grant(
        GRANT_PERMISSION_PARAMS,
        PERMISSION_MANAGER,
      )();

      expect(expectedGrantPermissionAction).eql(encodedGrantPermissionAction);
    });

    it('encodes a create permission and grant permission with parameters in the same function', async () => {
      const newPermission = NEW_PERMISSIONS[0];
      const expectedCreatePermissionWithParamsAction: Action[] = [
        {
          to: DAO.acl,
          data: encodeActCall(
            'createPermission(address,address,bytes32,address)',
            [
              ...resolvePermission(newPermission),
              DAO[PERMISSION_MANAGER as keyof typeof DAO],
            ],
          ),
        },
        {
          to: DAO.acl,
          data: encodeActCall(
            'grantPermissionP(address,address,bytes32,uint256[])',
            [...resolvePermission(newPermission), NEW_PERMISSION_PARAMS[3]()],
          ),
        },
      ];
      const encodedGrantPermissionAction = await evmcrispr.grant(
        NEW_PERMISSION_PARAMS,
        PERMISSION_MANAGER,
      )();

      expect(expectedCreatePermissionWithParamsAction).eql(
        encodedGrantPermissionAction,
      );
    });
  });

  describe('grantPermissions()', () => {
    it('encodes a set of create permission actions correctly', async () => {
      const expectedCreateActions = NEW_PERMISSIONS.map(
        (createPermission): Action => ({
          to: DAO.acl,
          data: encodeActCall(
            'createPermission(address,address,bytes32,address)',
            [
              ...resolvePermission(createPermission),
              DAO[PERMISSION_MANAGER as keyof typeof DAO],
            ],
          ),
        }),
      );
      const createActions = await evmcrispr.grantPermissions(
        NEW_PERMISSIONS,
        PERMISSION_MANAGER,
      )();

      expect(createActions).eql(expectedCreateActions);
    });
    it('encodes a set of grant permission actions correctly', async () => {
      const grantPermissions: Permission[] = GRANT_PERMISSIONS.map(
        ([, app, role]) => ['kernel', app, role],
      );
      const expectedGrantActions = grantPermissions.map(
        (grantPermission): Action => ({
          to: DAO.acl,
          data: encodeActCall(
            'grantPermission(address,address,bytes32)',
            resolvePermission(grantPermission),
          ),
        }),
      );
      const grantActions = await evmcrispr.grantPermissions(
        grantPermissions.map((p) => resolvePermission(p)),
        PERMISSION_MANAGER,
      )();

      expect(grantActions).eql(expectedGrantActions);
    });
  });

  describe('app()', () => {
    it(
      'fails when receiving an invalid identifier',
      isValidIdentifier((badIdentifier) => () => evmcrispr.app(badIdentifier)),
    );

    it('fails when fetching non-existent app', async () => {
      await expectThrowAsync(() => evmcrispr.app('non-existent.open'), {
        type: ErrorNotFound,
        name: 'ErrorAppNotFound',
      });
    });
    it('returns the correct app address', () => {
      const appAddress = evmcrispr.app('voting');

      expect(addressesEqual(DAO.voting, appAddress)).to.be.true;
    });
  });

  describe('apps()', () => {
    it('returns the list of apps', () => {
      expect(evmcrispr.apps()).to.be.eql([
        'kernel:0',
        'acl:0',
        'evm-script-registry:0',
        'vault:0',
        'finance:0',
        'token-manager:0',
        'voting:0',
        'disputable-voting.open:0',
        'tollgate.open:0',
      ]);
    });
    it('is updated when a new app is installed', async () => {
      const { appIdentifier, initializeParams } = APP;
      const appLabeledIdentifier = `${appIdentifier}:new`;
      await evmcrispr.install(appLabeledIdentifier, initializeParams)();
      expect(evmcrispr.apps())
        .to.be.length(10)
        .and.to.include(appLabeledIdentifier);
    });
  });

  describe('act()', () => {
    const target = EOA_ADDRESS;
    it(
      'fails when receiving an invalid identifier as the agent',
      isValidIdentifier(
        (badIdentifier) => evmcrispr.act(badIdentifier, target, 'mint()', []),
        false,
        false,
      ),
    );

    it(
      'fails when receiving an invalid identifier as the target',
      isValidIdentifier(
        (badIdentifier) => evmcrispr.act('agent', badIdentifier, 'mint()', []),
        false,
        false,
      ),
    );

    it('fails when receiving an invalid signature', async () => {
      await expectThrowAsync(
        evmcrispr.act('agent', target, 'mint', []),
        undefined,
        'Wrong signature format: mint',
      );
      await expectThrowAsync(
        evmcrispr.act('agent', target, 'mint(', []),
        undefined,
        'Wrong signature format: mint(',
      );
      await expectThrowAsync(
        evmcrispr.act('agent', target, 'mint(uint,)', []),
        undefined,
        'Wrong signature format: mint(uint,)',
      );
      await expectThrowAsync(
        evmcrispr.act('agent', target, 'mint(,uint)', []),
        undefined,
        'Wrong signature format: mint(,uint)',
      );
    });
    it('encodes an act action correctly', async () => {
      const {
        actTarget,
        actSignature,
        actSignatureParams,
        actSignatureUnresolvedParams,
      } = APP;
      const expectedCallAction: Action[] = [
        {
          to: DAO.vault,
          data: encodeActCall('forward(bytes)', [
            encodeCallScript([
              {
                to: actTarget,
                data: encodeActCall(actSignature, actSignatureParams),
              },
            ]),
          ]),
        },
      ];
      const callAction = await evmcrispr.act(
        'vault',
        actTarget,
        actSignature,
        actSignatureParams,
      )(); // TODO: Change it with an agent
      expect(callAction).eql(expectedCallAction);

      const callActionUnres = await evmcrispr.act(
        'vault',
        actTarget,
        actSignature,
        actSignatureUnresolvedParams,
      )(); // TODO: Change it with an agent
      expect(callActionUnres).eql(expectedCallAction);
    });
  });

  describe('exec()', () => {
    it(
      'fails when receiving an invalid identifier',
      isValidIdentifier(
        (badIdentifier) => evmcrispr.exec(badIdentifier),
        false,
        false,
      ),
    );

    it('fails when calling an invalid method', async () => {
      await expectThrowAsync(
        () => evmcrispr.exec('token-manager').unknownMethod,
        undefined,
        'Unknown method',
      );

      await expectThrowAsync(
        evmcrispr.exec('token-manager').mint(),
        undefined,
        "Invalid method's parameters",
      );
    });
    // TODO Check that params can be resolve (pass evmcrispr.app())
    it('encodes a call method correctly', async () => {
      const {
        callSignature,
        callSignatureParams,
        callSignatureUnresolvedParams,
      } = APP;
      const callMethod = callSignature.split('(')[0];
      const expectedCallAction: Action[] = [
        {
          to: DAO[APP.appIdentifier],
          data: encodeActCall(callSignature, callSignatureParams),
        },
      ];
      const callAction = await evmcrispr
        .exec(APP.appIdentifier)
        [callMethod](...callSignatureParams)();
      expect(callAction).eql(expectedCallAction);

      const callActionUnresolved = await evmcrispr
        .exec(APP.appIdentifier)
        [callMethod](...callSignatureUnresolvedParams)();
      expect(callActionUnresolved).eql(expectedCallAction);
    });

    it('can enumerate non-constant function calls', () => {
      const keys = Object.getOwnPropertyNames(evmcrispr.exec('token-manager'));
      expect(keys).include.members([
        'assignVested',
        'mint',
        'onTransfer',
        'transferToVault',
        'burn',
        'assign',
        'issue',
        'forward',
        'onApprove',
        'proxyPayment',
        'revokeVesting',
      ]);
    });

    it('can enumerate parameter names of a function', () => {
      const paramTypes = evmcrispr.exec('token-manager').mint.paramNames;
      expect(paramTypes).to.be.eql(['_receiver', '_amount']);
    });

    it('can enumerate parameter types of a function', () => {
      const paramTypes = evmcrispr.exec('token-manager').mint.paramTypes;
      expect(paramTypes).to.be.eql(['address', 'uint256']);
    });

    it('throws an error when enumerating parameter names and types of a function', async () => {
      await expectThrowAsync(
        () => evmcrispr.exec('token-manager').unknownMethod.paramNames,
        undefined,
        'Unknown method',
      );
      await expectThrowAsync(
        () => evmcrispr.exec('token-manager').unknownMethod.paramTypes,
        undefined,
        'Unknown method',
      );
    });
  });

  describe('install()', () => {
    it(
      'fails when receiving an invalid identifier',
      isValidIdentifier(
        (badIdentifier) => evmcrispr.install(badIdentifier),
        false,
        false,
      ),
    );

    it("fails when doesn't find the app's repo", async () => {
      const noRepoIdentifier = 'non-existent-repo.open:new-app';

      await expectThrowAsync(evmcrispr.install(noRepoIdentifier), {
        type: ErrorNotFound,
        name: 'ErrorRepoNotFound',
      });
    });

    it('encodes an installation action correctly', async () => {
      const {
        appId,
        appIdentifier,
        codeAddress,
        initializeParams,
        initializeUnresolvedParams,
        initializeSignature,
      } = APP;
      const expectedEncodedAction: Action[] = [
        {
          to: DAO.kernel.toLowerCase(),
          data: encodeActCall('newAppInstance(bytes32,address,bytes,bool)', [
            appId,
            codeAddress,
            encodeActCall(initializeSignature, initializeParams),
            false,
          ]),
        },
      ];
      const encodedAction = await evmcrispr.install(
        `${appIdentifier}:new-app`,
        initializeParams,
      )();

      expect(encodedAction).eql(expectedEncodedAction);

      const encodedActionUnresolved = await evmcrispr.install(
        `${appIdentifier}:new-app2`,
        initializeUnresolvedParams,
      )();
      expect(encodedActionUnresolved).eql(expectedEncodedAction);
    });

    it('installed app exists', async () => {
      const { appIdentifier, initializeParams } = APP;
      const appLabeledIdentifier = `${appIdentifier}:new-app`;

      await evmcrispr.install(appLabeledIdentifier, initializeParams)();

      const installedAppAddress = evmcrispr.app(appLabeledIdentifier);

      expect(utils.isAddress(installedAppAddress)).to.be.true;
    });

    it('fails when installing apps with the same label', async () => {
      const { initializeParams } = APP;

      await evmcrispr.install('token-manager:same-label', initializeParams)();

      await expectThrowAsync(
        evmcrispr.install('token-manager:same-label', initializeParams),
        {
          type: ErrorException,
        },
      );
    });
  });

  describe('revoke()', () => {
    testBadPermission((badPermission) => evmcrispr.revoke(badPermission, true));

    it('encodes a revoke permission and remove manager action correctly', async () => {
      const revokePermission = REVOKE_PERMISSIONS[0];
      const resolvedRevokePermission = resolvePermission(revokePermission);
      const expectedRevokeAction: Action = {
        to: DAO.acl.toLowerCase(),
        data: encodeActCall(
          'revokePermission(address,address,bytes32)',
          resolvedRevokePermission,
        ),
      };
      const expectedRemoveManagerAction: Action = {
        to: DAO.acl.toLowerCase(),
        data: encodeActCall(
          'removePermissionManager(address,bytes32)',
          resolvedRevokePermission.slice(1, 3),
        ),
      };
      const actions = await evmcrispr.revoke(revokePermission, true)();

      expect(actions).eql([expectedRevokeAction, expectedRemoveManagerAction]);
    });

    it("doesn't encode a remove manager action when told not to`", async () => {
      const actions = await evmcrispr.revoke(
        ['voting', 'voting', 'MODIFY_QUORUM_ROLE'],
        false,
      )();

      expect(actions.length).eq(1);
    });

    it("fails when revoking a permission from an entity that doesn't have it", async () => {
      const [, app, role] = REVOKE_PERMISSIONS[0];
      await expectThrowAsync(
        evmcrispr.revoke(['evm-script-registry', app, role], true),
        {
          type: ErrorNotFound,
          name: 'ErrorPermissionNotFound',
        },
      );
    });
  });

  describe('revokePermissions()', () => {
    it('encodes a set of revoke permissions and permission manager actions correctly', async () => {
      const expectedRevokeActions = REVOKE_PERMISSIONS.reduce(
        (revokingActions: Action[], permission) => {
          const resolvedPermission = resolvePermission(permission);
          return [
            ...revokingActions,
            {
              to: DAO.acl,
              data: encodeActCall(
                'revokePermission(address,address,bytes32)',
                resolvedPermission,
              ),
            },
            {
              to: DAO.acl,
              data: encodeActCall(
                'removePermissionManager(address,bytes32)',
                resolvedPermission.slice(1, 3),
              ),
            },
          ];
        },
        [],
      );
      const revokeActions = await evmcrispr.revokePermissions(
        REVOKE_PERMISSIONS,
        true,
      )();

      expect(revokeActions).eql(expectedRevokeActions);
    });
  });

  describe('setOracle()', () => {
    it('encodes an ACL oracle parameter from an address', () => {
      const oracle = evmcrispr.setOracle(EOA_ADDRESS)();
      const expectedOracle = [
        `0xcb0100000000000000000000${EOA_ADDRESS.slice(2)}`,
      ];
      expect(expectedOracle).eql(oracle);
    });

    it('encodes an ACL oracle parameter from an app identifier', () => {
      const oracle = evmcrispr.setOracle('voting')();
      const app = evmcrispr.app('voting');
      const expectedOracle = [`0xcb0100000000000000000000${app.slice(2)}`];
      expect(expectedOracle).eql(oracle);
    });

    it('encodes an ACL oracle parameter from a counterfactual app', async () => {
      const { appIdentifier, initializeParams } = APP;
      const oracleF = evmcrispr.setOracle(`${appIdentifier}:new-oracle`);
      await evmcrispr.install(
        `${appIdentifier}:new-oracle`,
        initializeParams,
      )();
      const app = evmcrispr.app(`${appIdentifier}:new-oracle`);
      const oracle = oracleF();
      const expectedOracle = [`0xcb0100000000000000000000${app.slice(2)}`];
      expect(expectedOracle).eql(oracle);
    });
  });
});
