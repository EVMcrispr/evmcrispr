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
  parseLabeledAppIdentifier,
  isForwarder,
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
  PermissionMap,
} from "./types";
import { ErrorAppNotFound, ErrorException, ErrorMethodNotFound, ErrorInvalid, ErrorNotFound } from "./errors";

export default class EVMcrispr {
  readonly connector: Connector;
  #appCache: AppCache;
  #appInterfaceCache: AppInterfaceCache;
  #installedAppCounter: number;
  #signer: Signer;

  ANY_ENTITY = "0x" + "F".repeat(40); // 0xFFFF...FFFF;

  NO_ENTITY = ZERO_ADDRESS; // 0x0000...0000;

  constructor(signer: Signer, chainId: number) {
    this.connector = new Connector(chainId, IPFS_URI_TEMPLATE);
    this.#signer = signer;
    this.#appCache = new Map();
    this.#appInterfaceCache = new Map();
    this.#installedAppCounter = 0;
  }

  /**
   * Connect to a DAO by fetching and caching all its apps and permissions data.
   * It is necessary to connect to a DAO before doing anything else.
   * @param {Address} daoAddress The address of the DAO to connect to.
   */
  async connect(daoAddress: Address): Promise<void> {
    this.#installedAppCounter = 0;
    const [appCache, appResourcesCache] = await this._buildCaches(await this.connector.organizationApps(daoAddress));
    this.#appCache = appCache;
    this.#appInterfaceCache = appResourcesCache;
  }

  appCache(): AppCache {
    return this.#appCache;
  }

  /**
   * Encode an action that calls an app's contract function.
   * @param {AppIdentifier} appIdentifier The identifier of the app being called.
   * @returns {Proxy} A proxy of the app that intercepts calls to it and gives back a function that returns the encoded contract function call.
   */
  call(appIdentifier: AppIdentifier): () => App {
    return new Proxy(() => this._resolveApp(appIdentifier), {
      get: (getTargetApp, functionProperty: string) => {
        return (...params: any): Function<Action> => {
          try {
            return () => {
              const targetApp = getTargetApp();
              return {
                to: targetApp.address,
                data: targetApp.abiInterface.encodeFunctionData(functionProperty, this._resolveParams(params)),
              };
            };
          } catch (err) {
            throw new ErrorMethodNotFound(functionProperty, appIdentifier);
          }
        };
      },
    });
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param {AppIdentifier | LabeledAppIdentifier} appIdentifier The identifier of the app being fetched.
   * @returns {Address} The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Function<Address> {
    return () => this._resolveApp(appIdentifier).address;
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps.
   * @param {Function<RawAction>[]} actionFunctions The array of action-returning functions being encoded.
   * @param  {ForwardOptions} options The forward options object.
   * @param {Entity[]} options.path Array of forwarding apps being used to encode the forwarding action.
   * @param {String} options.context String containing context information. Needed for forwarders with context (AragonOS v5).
   * @returns {Promise<{ action: Action; preTxActions: Action[] }>} A promise that resolves to an object
   * containing the encoded forwarding action as well as any pre-transactions that need to be executed.
   */
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

      if (!(await isForwarder(forwarder))) {
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
        forwarderActions = [
          {
            to: forwarderAddress,
            data: encodeActCall("forward(bytes,bytes)", [script, utils.formatBytes32String(options.context)]),
          },
        ];
      } else {
        forwarderActions = [{ to: forwarderAddress, data: encodeActCall("forward(bytes)", [script]) }];
      }
    }

    return { action: { ...forwarderActions[0], value }, preTxActions };
  }

  /**
   * Encode an action that installs a new app.
   * @param {LabeledAppIdentifier} identifier Identifier of the app being installed.
   * @param {any[]} initParams Array of the parameters needed to initialize the app.
   * @returns {Function<Promise<Action>>} A function returning a promise that resolves to the installation action.
   */
  installNewApp(identifier: LabeledAppIdentifier, initParams: any[] = []): Function<Promise<Action>> {
    return async () => {
      try {
        const [appName, registry] = parseLabeledAppIdentifier(identifier);
        const appRepo = await this.connector.repo(appName, registry);
        const { codeAddress, contentUri, artifact: appArtifact } = appRepo;
        const kernel = this._resolveApp("kernel");
        const abiInterface = new utils.Interface(appArtifact.abi);
        const encodedInitializeFunction = abiInterface.encodeFunctionData(
          "initialize",
          this._resolveParams(initParams)
        );
        const appId = utils.namehash(appArtifact.appName);

        const nonce = await buildNonceForAddress(kernel.address, this.#installedAppCounter, this.#signer.provider!);
        const proxyContractAddress = calculateNewProxyAddress(kernel.address, nonce);

        if (this.#appCache.has(identifier)) {
          throw new ErrorException(`Identifier ${identifier} is already in use`);
        }

        if (!this.#appInterfaceCache.has(codeAddress)) {
          this.#appInterfaceCache.set(codeAddress, abiInterface);
        }

        this.#appCache.set(identifier, {
          address: proxyContractAddress,
          name: appName,
          codeAddress,
          contentUri,
          abi: appArtifact.abi,
          // Set a reference to the app interface
          abiInterface: this.#appInterfaceCache.get(codeAddress)!,
          permissions: appArtifact.roles.reduce((permissionsMap: PermissionMap, role: any) => {
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
      } catch (err) {
        console.error(`Error when encoding ${identifier} installation action: `);
        throw err;
      }
    };
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps and send it in a transaction.
   * @param {Function<RawAction>[]} actions The array of action-returning functions being encoded.
   * @param {ForwardOptions} options A forwarding option object
   * @param {Entity[]} options.path Array of forwarding apps identifiers or addresses being used to encode
   * the forwarding action.
   * @param {String} options.context String containing context information. Needed for forwarders with
   * context (AragonOS v5).
   * @returns {Promise<providers.TransactionReceipt>} A promise that resolves to a receipt of
   * the sent transaction.
   */
  async forward(actions: Function<RawAction>[], options: ForwardOptions): Promise<providers.TransactionReceipt> {
    const { action, preTxActions } = await this.encode(actions, options);

    // Execute pretransactions actions
    for (const action of preTxActions) {
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
        ...action,
        gasLimit: TX_GAS_LIMIT,
        gasPrice: TX_GAS_PRICE,
      })
    ).wait();
  }

  /**
   * Encode an action that creates a new app permission.
   * @param {Permission} permission The permission being created.
   * @param {Entity} defaultPermissionManager The entity being set as the permission manager.
   * @returns {Function<Action>} A function that returns the permission action.
   */
  addPermission(permission: Permission, defaultPermissionManager: Entity): Function<Action> {
    return () => {
      const [grantee, app, role] = permission;
      const [granteeAddress, appAddress, roleHash] = this._resolvePermission(permission);
      const manager = this._resolveEntity(defaultPermissionManager);
      const { permissions: appPermissions } = this._resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      const appPermission = appPermissions.get(roleHash);
      if (!appPermission?.grantees.size) {
        appPermissions.set(roleHash, {
          manager,
          grantees: new Set([granteeAddress]),
        });
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

  /**
   * Encode a set of actions that create new app permissions.
   * @param {Permission[]} permissions An array containing the permissions being created.
   * @param {Entity} defaultPermissionManager The entity being set as the permission manager of every permission
   * created.
   * @returns {Function<Action[]>} A function that returns an array of permission actions.
   */
  addPermissions(permissions: Permission[], defaultPermissionManager: Entity): Function<Action[]> {
    return () => permissions.map((p) => this.addPermission(p, defaultPermissionManager)());
  }

  /**
   * Encode an action that revokes an app's permission.
   * @param {Permission} permission The permission being revoked.
   * @param removeManager A boolean that indicates whether or not to remove the permission manager.
   * @returns {Function<Action[]>} A function that returns an array of revoking actions.
   */
  revokePermission(permission: Permission, removeManager = true): Function<Action[]> {
    return () => {
      const actions = [];
      const [_, app, role] = permission;
      const [entityAddress, appAddress, roleHash] = this._resolvePermission(permission);
      const { permissions: appPermissions } = this._resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this._resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      actions.push({
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData("revokePermission", [entityAddress, appAddress, roleHash]),
      });

      if (removeManager) {
        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData("removePermissionManager", [appAddress, roleHash]),
        });
      }

      return actions;
    };
  }

  /**
   * Encode a set of actions that revoke an app's permission.
   * @param {Permission[]} permissions An array containing the permissions being revoked.
   * @param {boolean} removeManager A boolean that indicates wether or not to remove the permission manager.
   * @returns {Function<Action[]>} A function that returns an array of revoking actions.
   */
  revokePermissions(permissions: Permission[], removeManager = true): Function<Action[]> {
    return () =>
      permissions.reduce((actions: Action[], permission) => {
        const action = this.revokePermission(permission, removeManager)();
        return [...actions, ...action];
      }, []);
  }

  private _resolveApp(identifier: string): App {
    let resolvedIdentifier = resolveIdentifier(identifier);

    if (!this.#appCache.has(resolvedIdentifier)) {
      throw new ErrorAppNotFound(resolvedIdentifier);
    }

    return this.#appCache.get(resolvedIdentifier)!;
  }

  private _resolveEntity(entity: Entity): Address {
    return utils.isAddress(entity) ? entity : this.app(entity)();
  }

  private _resolveParams(params: any[]): any[] {
    return params.map((param) => (param instanceof Function ? param() : param));
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
      app.abiInterface = appInterfaceCache.get(codeAddress)!;

      appCache.set(`${name}:${counter}`, app);
      appCounter.set(name, counter + 1);
    }

    return [appCache, appInterfaceCache];
  };
}
