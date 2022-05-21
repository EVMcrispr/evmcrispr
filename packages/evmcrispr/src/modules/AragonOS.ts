import { constants, utils } from 'ethers';

import { ErrorException, ErrorInvalid, ErrorNotFound } from '../errors';
import type EVMcrispr from '../EVMcrispr';
import {
  buildAppArtifact,
  buildAppPermissions,
  buildNonceForAddress,
  calculateNewProxyAddress,
  fetchAppArtifact,
  getFunctionParams,
  normalizeActions,
  oracle,
  parseLabeledAppIdentifier,
} from '../helpers';
import type {
  ActionFunction,
  Address,
  AppIdentifier,
  Entity,
  LabeledAppIdentifier,
  Params,
  Permission,
  PermissionP,
} from '../types';

export default class AragonOS {
  evm: EVMcrispr;

  #installedAppCounter: number;
  #newTokenCounter: number;

  constructor(evm: EVMcrispr) {
    this.evm = evm;
    this.#installedAppCounter = 0;
    this.#newTokenCounter = 0;
  }

  /**
   * Encode an action that creates a new app permission or grant it if it already exists.
   * @param permission The permission to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager.
   * @returns A function that returns the permission action.
   */
  grant(
    permission: Permission | PermissionP,
    defaultPermissionManager: Entity,
  ): ActionFunction {
    return async () => {
      const [grantee, app, role, getParams = () => []] = permission;
      const [granteeAddress, appAddress, roleHash] =
        this.evm.resolver.resolvePermission([grantee, app, role]);

      if (!defaultPermissionManager) {
        throw new ErrorInvalid(
          `Permission not well formed, permission manager missing`,
          {
            name: 'ErrorInvalidIdentifier',
          },
        );
      }

      const params = getParams();
      const manager = this.evm.resolver.resolveEntity(defaultPermissionManager);
      const { permissions: appPermissions } = this.evm.resolver.resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } =
        this.evm.resolver.resolveApp('acl');
      const actions = [];

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(
          `Permission ${role} doesn't exists in app ${app}.`,
        );
      }

      const appPermission = appPermissions.get(roleHash)!;

      // If the permission already existed and no parameters are needed, just grant to a new entity and exit
      if (
        appPermission.manager !== '' &&
        appPermission.manager !== constants.AddressZero &&
        params.length == 0
      ) {
        if (appPermission.grantees.has(granteeAddress)) {
          throw new ErrorException(
            `Grantee ${grantee} already has permission ${role}`,
          );
        }
        appPermission.grantees.add(granteeAddress);

        return [
          {
            to: aclAddress,
            data: aclAbiInterface.encodeFunctionData('grantPermission', [
              granteeAddress,
              appAddress,
              roleHash,
            ]),
          },
        ];
      }

      // If the permission does not exist previously, create it
      if (
        appPermission.manager === '' ||
        appPermission.manager === constants.AddressZero
      ) {
        appPermissions.set(roleHash, {
          manager,
          grantees: new Set([granteeAddress]),
        });

        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData('createPermission', [
            granteeAddress,
            appAddress,
            roleHash,
            manager,
          ]),
        });
      }

      // If we need to set up parameters we call the grantPermissionP function, even if we just created the permission
      if (params.length > 0) {
        if (appPermission.grantees.has(granteeAddress)) {
          throw new ErrorException(
            `Grantee ${grantee} already has permission ${role}.`,
          );
        }
        appPermission.grantees.add(granteeAddress);

        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData('grantPermissionP', [
            granteeAddress,
            appAddress,
            roleHash,
            params,
          ]),
        });
      }

      return actions;
    };
  }

  /**
   * Encode a set of actions that create new app permissions.
   * @param permissions The permissions to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager
   * of every permission created.
   * @returns A function that returns an array of permission actions.
   */
  grantPermissions(
    permissions: (Permission | PermissionP)[],
    defaultPermissionManager: Entity,
  ): ActionFunction {
    return normalizeActions(
      permissions.map((p) => this.grant(p, defaultPermissionManager)),
    );
  }

  /**
   * Use DAO agent to call an external contract function
   * @param agent App identifier of the agent that is going to be used to call the function
   * @param target Address of the external contract
   * @param signature Function signature that is going to be called
   * @param params Array of parameters that are going to be used to call the function
   * @returns A function that retuns an action to forward an agent call with the specified parameters
   */
  act(
    agent: AppIdentifier,
    target: Entity,
    signature: string,
    params: any[],
  ): ActionFunction {
    return async () => {
      return this.evm.forwardActions(agent, [
        this.evm.encodeAction(target, signature, params),
      ])();
    };
  }

  /**
   * Use DAO agent to perform a set of transactions using agent's execute function
   * @param agent App identifier of the agent that is going to be used to perform the actions
   * @param actions List of actions that the agent is going to perform
   * @returns A function that retuns an action to forward an agent call with the specified parameters
   */
  agentExec(
    agent: AppIdentifier,
    actions: ActionFunction[],
    useSafeExecute = false,
  ): ActionFunction {
    return async () => {
      return (
        await Promise.all(
          (
            await normalizeActions(actions)()
          ).map((action) =>
            useSafeExecute
              ? this.exec(agent, 'safeExecute', [action.to, action.data])()
              : this.exec(agent, 'execute', [
                  action.to,
                  action.value ?? 0,
                  action.data,
                ])(),
          ),
        )
      ).flat();
    };
  }

  /**
   * Encode an action that calls an app's contract function.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to call to.
   * @param functionName Function name, such as mint.
   * @param params Array with the parameters passed to the encoded function.
   * @returns A function that retuns an action to forward a call with the specified parameters
   */
  exec(
    appIdentifier: AppIdentifier | LabeledAppIdentifier,
    functionName: string,
    params: any,
  ): ActionFunction {
    return async () => {
      try {
        const targetApp = this.evm.resolver.resolveApp(appIdentifier);
        const [, paramTypes] = getFunctionParams(
          functionName,
          targetApp.abiInterface,
        );
        return [
          {
            to: targetApp.address,
            data: targetApp.abiInterface.encodeFunctionData(
              functionName,
              this.evm.resolver.resolveParams(params, paramTypes),
            ),
          },
        ];
      } catch (err: any) {
        err.message = `Error when encoding call to method ${functionName} of app ${appIdentifier}: ${err.message}`;
        throw err;
      }
    };
  }

  newToken(
    name: string,
    symbol: string,
    controller: Entity,
    decimals = 18,
    transferable = true,
  ): ActionFunction {
    const factories = new Map([
      [1, '0xA29EF584c389c67178aE9152aC9C543f9156E2B3'],
      [4, '0xad991658443c56b3dE2D7d7f5d8C68F339aEef29'],
      [100, '0xf7d36d4d46cda364edc85e5561450183469484c5'],
      [137, '0xcFed1594A5b1B612dC8199962461ceC148F14E68'],
    ]);
    const factory = new utils.Interface([
      'function createCloneToken(address _parentToken, uint _snapshotBlock, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, bool _transfersEnabled) external returns (address)',
    ]);
    const controlled = new utils.Interface([
      'function changeController(address _newController) external',
    ]);
    return async () => {
      const chainId = await this.evm.signer.getChainId();
      if (!factories.has(chainId)) {
        throw new Error(
          `No MiniMeTokenFactory registered in network ${chainId}`,
        );
      }

      await this.#registerNextProxyAddress(controller);
      const controllerAddress = this.evm.resolver.resolveEntity(controller);
      const nonce = await buildNonceForAddress(
        factories.get(chainId)!,
        this.#newTokenCounter++,
        this.evm.signer.provider!,
      );
      const newTokenAddress = calculateNewProxyAddress(
        factories.get(chainId)!,
        nonce,
      );
      this.evm.addressBook.set(`token:${symbol}`, newTokenAddress);
      return [
        {
          to: factories.get(chainId)!,
          data: factory.encodeFunctionData('createCloneToken', [
            constants.AddressZero,
            0,
            name,
            decimals,
            symbol,
            transferable,
          ]),
        },
        {
          to: newTokenAddress,
          data: controlled.encodeFunctionData('changeController', [
            controllerAddress,
          ]),
        },
      ];
    };
  }

  /**
   * Encode an action that installs a new app.
   * @param identifier [[LabeledAppIdentifier | Identifier]] of the app to install.
   * @param initParams Parameters to initialize the app.
   * @returns A function which returns a promise that resolves to the installation action.
   */
  install(
    identifier: LabeledAppIdentifier,
    initParams: any[] = [],
  ): ActionFunction {
    return async () => {
      try {
        const [appName, registry] = parseLabeledAppIdentifier(identifier);
        const appRepo = await this.evm.connector.repo(appName, registry);
        const { codeAddress, contentUri, artifact: repoArtifact } = appRepo;

        if (!this.evm.appArtifactCache.has(codeAddress)) {
          const artifact =
            repoArtifact ??
            (await fetchAppArtifact(this.evm.ipfsResolver, contentUri));
          this.evm.appArtifactCache.set(
            codeAddress,
            buildAppArtifact(artifact),
          );
        }

        const { abiInterface, roles } =
          this.evm.appArtifactCache.get(codeAddress)!;
        const kernel = this.evm.resolver.resolveApp('kernel');
        const [, types] = getFunctionParams('initialize', abiInterface);
        const encodedInitializeFunction = abiInterface.encodeFunctionData(
          'initialize',
          this.evm.resolver.resolveParams(initParams, types),
        );
        const appId = utils.namehash(`${appName}.${registry}`);
        if (!this.evm.addressBook.has(identifier)) {
          await this.#registerNextProxyAddress(identifier);
        }
        const proxyContractAddress =
          this.evm.resolver.resolveEntity(identifier);
        if (this.evm.appCache.has(identifier)) {
          throw new ErrorException(
            `Identifier ${identifier} is already in use.`,
          );
        }

        this.evm.appCache.set(identifier, {
          abiInterface: abiInterface,
          address: proxyContractAddress,
          codeAddress,
          contentUri,
          name: appName,
          permissions: buildAppPermissions(roles, []),
          registryName: registry,
        });

        return [
          {
            to: kernel.address,
            data: kernel.abiInterface.encodeFunctionData(
              'newAppInstance(bytes32,address,bytes,bool)',
              [appId, codeAddress, encodedInitializeFunction, false],
            ),
          },
        ];
      } catch (err: any) {
        err.message = `Error when encoding ${identifier} installation action: ${err.message}`;
        throw err;
      }
    };
  }

  /**
   * Upgrade all installed apps of a specific APM repo to a new implementation contract.
   * @param apmRepo ENS name of the APM repository
   * @param newAppAddress Address of the new implementation contract
   * @returns A function that returns the upgrade action
   */
  upgrade(apmRepo: string, newAppAddress: Address): ActionFunction {
    return async () => {
      if (!apmRepo.endsWith('.eth')) {
        throw new ErrorException(`The APM repo must be an ENS name.`);
      }
      const kernel = this.evm.resolver.resolveApp('kernel');
      const KERNEL_APP_BASE_NAMESPACE = utils.id('base');
      const appId = utils.namehash(apmRepo);
      return [
        {
          to: kernel.address,
          data: kernel.abiInterface.encodeFunctionData(
            'setApp(bytes32,bytes32,address)',
            [KERNEL_APP_BASE_NAMESPACE, appId, newAppAddress],
          ),
        },
      ];
    };
  }

  /**
   * Encode an action that revokes an app permission.
   * @param permission The permission to revoke.
   * @param removeManager A boolean that indicates whether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revoke(permission: Permission, removeManager = false): ActionFunction {
    return async () => {
      const actions = [];
      const [grantee, app, role] = permission;
      const [entityAddress, appAddress, roleHash] =
        this.evm.resolver.resolvePermission(permission);
      const { permissions: appPermissions } = this.evm.resolver.resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } =
        this.evm.resolver.resolveApp('acl');

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(
          `Permission ${role} doesn't exists in app ${app}.`,
        );
      }

      const appPermission = appPermissions.get(roleHash)!;

      if (!appPermission.grantees.has(entityAddress)) {
        throw new ErrorNotFound(
          `Entity ${grantee} doesn't have permission ${role} to be revoked.`,
          {
            name: 'ErrorPermissionNotFound',
          },
        );
      }

      appPermission.grantees.delete(entityAddress);

      actions.push({
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData('revokePermission', [
          entityAddress,
          appAddress,
          roleHash,
        ]),
      });

      if (removeManager) {
        delete appPermission.manager;
        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData('removePermissionManager', [
            appAddress,
            roleHash,
          ]),
        });
      }

      return actions;
    };
  }

  /**
   * Encode a set of actions that revoke an app permission.
   * @param permissions The permissions to revoke.
   * @param removeManager A boolean that indicates wether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revokePermissions(
    permissions: Permission[],
    removeManager = false,
  ): ActionFunction {
    return normalizeActions(
      permissions.map((p) => this.revoke(p, removeManager)),
    );
  }

  /**
   * Encode a permission parameter array with an oracle.
   * @param entity The address or app identifier used as oracle
   * @returns A Params object that can be composed with other params or passed directly as a permission param
   */
  setOracle(entity: Entity): Params {
    return oracle(
      utils.isAddress(entity)
        ? entity
        : () => this.evm.resolver.resolveApp(entity).address,
    );
  }

  async #registerNextProxyAddress(identifier: string): Promise<void> {
    const kernel = this.evm.resolver.resolveApp('kernel');
    const nonce = await buildNonceForAddress(
      kernel.address,
      this.#installedAppCounter++,
      this.evm.signer.provider!,
    );
    this.evm.addressBook.set(
      identifier,
      calculateNewProxyAddress(kernel.address, nonce),
    );
  }
}
