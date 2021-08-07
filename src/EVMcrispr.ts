import { BigNumber, Contract, providers, Signer, utils } from "ethers";
import { Address, encodeCallScript, erc20ABI } from "@1hive/connect-core";
import Connector from "./connector";
import {
  FORWARDER_TYPES,
  FORWARDER_ABI,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
  ZERO_ADDRESS,
  TX_GAS_LIMIT,
  TX_GAS_PRICE,
  buildNonceForAddress,
  calculateNewProxyAddress,
  normalizeActions,
  normalizeRole,
  IPFS_URI_TEMPLATE,
  resolveIdentifier,
  parseLabeledAppRegistryIdentifier,
  isLabeledAppRegistryIdentifier,
} from "./helpers";
import {
  Action,
  AppIdentifier,
  AppCache,
  AppInterfaceCache,
  Entity,
  LabeledAppIdentifier,
  ForwardOptions,
  Permission,
  App,
  RawAction,
  Function,
  LabeledAppRegistryIdentifier,
} from "./types";
import {
  ErrorAppNotFound,
  ErrorException,
  ErrorInvalidIdentifier,
  ErrorMethodNotFound,
  ErrorInvalid,
  ErrorNotFound,
} from "./errors";

export default class EVMcrispr {
  readonly connector: Connector;
  #appCache: AppCache;
  #appInterfaceCache: AppInterfaceCache;
  #installedAppCounter: number;
  #signer: Signer;

  ANY_ENTITY = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

  constructor(signer: Signer, chainId: number) {
    this.connector = new Connector(chainId, IPFS_URI_TEMPLATE);
    this.#signer = signer;
  }

  async connect(daoAddress) {
    this.#installedAppCounter = 0;
    const [appCache, appResourcesCache] = await this._buildCaches(await this.connector.organizationApps(daoAddress));
    this.#appCache = appCache;
    this.#appInterfaceCache = appResourcesCache;
  }

  call(appIdentifier: AppIdentifier): any {
    return new Proxy(() => this._resolveApp(appIdentifier), {
      get: (getTargetApp, functionProperty: string) => {
        return (...params: any): Function<Action> => {
          try {
            return () => {
              const targetApp = getTargetApp();
              return {
                to: targetApp.address,
                data: targetApp.abiInterface.encodeFunctionData(functionProperty, params),
              };
            };
          } catch (err) {
            throw new ErrorMethodNotFound(functionProperty, appIdentifier);
          }
        };
      },
    });
  }

  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Address {
    return this._resolveApp(appIdentifier).address;
  }

  async encode(
    actionFunctions: Function<RawAction>[],
    options: ForwardOptions
  ): Promise<{ action: Action; preTxActions: Action[] }> {
    const actions = await normalizeActions(actionFunctions);
    // Need to build the evmscript starting from the last forwarder
    const forwarders = options.path.map((entity) => this._resolveEntity(entity)).reverse();
    const preTxActions: Action[] = [];

    let script: string;
    let forwarderActions = [...actions];
    let value = BigNumber.from(0);

    for (let i = 0; i < forwarders.length; i++) {
      script = encodeCallScript(forwarderActions);
      const forwarderAddress = forwarders[i];
      const forwarder = new Contract(forwarderAddress, FORWARDER_ABI, this.#signer.provider);

      try {
        const res = await forwarder.isForwarder();
        if (!res) {
          throw new Error();
        }
      } catch (err) {
        throw new ErrorInvalid(`App ${forwarder.address} is not a forwarder`);
      }

      const fee = await getForwarderFee(forwarder);

      if (fee) {
        const [feeTokenAddress, feeAmount] = fee;

        // Check if fees are in ETH
        if (feeTokenAddress === ZERO_ADDRESS) {
          value = feeAmount;
        } else {
          const feeToken = new Contract(feeTokenAddress, erc20ABI, this.#signer.provider);
          const allowance = (await feeToken.allowance(await this.#signer.getAddress(), forwarderAddress)) as BigNumber;

          if (allowance.gt(0) && allowance.lt(feeAmount)) {
            preTxActions.push({
              to: feeTokenAddress,
              data: feeToken.interface.encodeFunctionData("approve", [forwarderAddress, 0]),
            });
          }
          if (allowance.eq(0)) {
            preTxActions.push({
              to: feeTokenAddress,
              data: feeToken.interface.encodeFunctionData("approve", [forwarderAddress, feeAmount]),
            });
          }
        }
      }

      if ((await getForwarderType(forwarder)) === FORWARDER_TYPES.WITH_CONTEXT) {
        forwarderActions = [{ to: forwarderAddress, data: encodeActCall("forward(bytes,bytes)", [script, context]) }];
      } else {
        forwarderActions = [{ to: forwarderAddress, data: encodeActCall("forward(bytes)", [script]) }];
      }
    }

    return { action: { ...forwarderActions[0], value }, preTxActions };
  }

  installNewApp(identifier: LabeledAppRegistryIdentifier, initParams: any[] = []): Function<Promise<Action>> {
    return async () => {
      if (!isLabeledAppRegistryIdentifier(identifier)) {
        throw new ErrorInvalidIdentifier(identifier);
      }
      const [appName, label, registry] = parseLabeledAppRegistryIdentifier(identifier);
      const appRepo = await this.connector.repo(appName, registry);
      const { codeAddress, contentUri, artifact: appArtifact } = appRepo;
      const kernel = this._resolveApp("kernel");
      const abiInterface = new utils.Interface(appArtifact.abi);
      const encodedInitializeFunction = abiInterface.encodeFunctionData("initialize", initParams);
      const appId = utils.namehash(appArtifact.appName);

      const nonce = await buildNonceForAddress(kernel.address, this.#installedAppCounter, this.#signer.provider);
      const proxyContractAddress = calculateNewProxyAddress(kernel.address, nonce);

      if (this.#appCache.has(label)) {
        throw new ErrorException(`Label ${label} is already in use`);
      }

      if (!this.#appInterfaceCache.has(codeAddress)) {
        this.#appInterfaceCache.set(codeAddress, abiInterface);
      }

      this.#appCache.set(label, {
        address: proxyContractAddress,
        name: appName,
        codeAddress,
        contentUri,
        abi: appArtifact.abi,
        // Set a reference to the app interface
        abiInterface: this.#appInterfaceCache.get(codeAddress),
        permissions: appArtifact.roles.reduce((permissionsMap, role) => {
          permissionsMap.set(role.bytes, { manager: null, grantees: new Set() });
          return permissionsMap;
        }, new Map()),
      });

      this.#installedAppCounter++;

      return {
        to: kernel.address,
        data: kernel.abiInterface.encodeFunctionData("newAppInstance(bytes32,address,bytes,bool)", [
          appId,
          codeAddress,
          encodedInitializeFunction,
          false,
        ]),
      };
    };
  }

  async forward(actions: Function<RawAction>[], options: ForwardOptions): Promise<providers.TransactionReceipt> {
    const forwarderAction = await this.encode(actions, options);

    // Execute pretransactions actions
    for (const action of forwarderAction.preTxActions) {
      await (
        await this.#signer.sendTransaction({
          ...action,
          gasLimit: TX_GAS_LIMIT,
          gasPrice: TX_GAS_PRICE,
        })
      ).wait();
    }

    return await (
      await this.#signer.sendTransaction({
        ...forwarderAction.action,
        gasLimit: TX_GAS_LIMIT,
        gasPrice: TX_GAS_PRICE,
      })
    ).wait();
  }

  addPermission(permission: Permission, defaultPermissionManager: Entity): Function<Action> {
    return () => {
      const [grantee, app, role] = permission;
      const [granteeAddress, appAddress, roleHash] = this._resolvePermission(permission);
      const manager = this._resolveEntity(defaultPermissionManager);
      const resolvedApp = this._resolveApp(app);
      const { permissions: appPermissions } = resolvedApp;
      const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      const appPermission = appPermissions.get(roleHash);
      if (!appPermission.grantees.size) {
        appPermission.manager = manager;
        appPermission.grantees.add(granteeAddress);

        return {
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData("createPermission", [granteeAddress, appAddress, roleHash, manager]),
        };
      } else {
        if (appPermission.grantees.has(granteeAddress)) {
          throw new ErrorException(`Grantee ${grantee} already has permission ${role}`);
        }
        appPermission.grantees.add(granteeAddress);

        return {
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData("grantPermission", [granteeAddress, appAddress, roleHash]),
        };
      }
    };
  }

  addPermissions(permissions: Permission[], defaultPermissionManager: Entity): Function<Action[]> {
    return () => permissions.map((p) => this.addPermission(p, defaultPermissionManager)());
  }

  revokePermission(permission: Permission, removeManager = true): Function<Action[]> {
    return () => {
      const [_, app, role] = permission;
      const [entityAddress, appAddress, roleHash] = this._resolvePermission(permission);
      const { permissions: appPermissions } = this._resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      const revokeAction = {
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData("revokePermission", [entityAddress, appAddress, roleHash]),
      };

      return [
        revokeAction,
        removeManager
          ? {
              to: aclAddress,
              data: aclAbiInterface.encodeFunctionData("removePermissionManager", [appAddress, roleHash]),
            }
          : null,
      ];
    };
  }

  revokePermissions(permissions: Permission[], removeManager = true): Function<Action[]> {
    return () =>
      permissions.reduce((actions, permission) => {
        const action = this.revokePermission(permission, removeManager)();
        return [...actions, ...action];
      }, []);
  }

  private _resolveApp(identifier: string): App {
    let resolvedIdentifier = resolveIdentifier(identifier);

    if (!this.#appCache.has(resolvedIdentifier)) {
      throw new ErrorAppNotFound(resolvedIdentifier);
    }

    return this.#appCache.get(resolvedIdentifier);
  }

  private _resolveEntity(entity: Entity): Address {
    return utils.isAddress(entity) ? entity : this.app(entity);
  }

  private _resolvePermission(permission: Permission): Entity[] {
    return permission.map((entity, index) =>
      index < permission.length - 1 ? this._resolveEntity(entity) : normalizeRole(entity)
    );
  }

  private _buildCaches = async (apps: App[]): Promise<[AppCache, AppInterfaceCache]> => {
    const appCache: AppCache = new Map();
    const appInterfaceCache: AppInterfaceCache = new Map();
    const appCounter = new Map();

    for (const app of apps) {
      const { name, codeAddress, abi } = app;
      const counter = appCounter.has(name) ? appCounter.get(name) : 0;

      if (!appInterfaceCache.has(codeAddress)) {
        appInterfaceCache.set(codeAddress, new utils.Interface(abi));
      }
      // Set reference to app interface
      app.abiInterface = appInterfaceCache.get(codeAddress);

      appCache.set(`${name}:${counter}`, app);
      appCounter.set(name, counter + 1);
    }

    return [appCache, appInterfaceCache];
  };
}
