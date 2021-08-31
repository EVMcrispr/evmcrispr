import { BigNumber, constants, Contract, providers, Signer, utils } from "ethers";
import { encodeCallScript, erc20ABI } from "@1hive/connect-core";
import Connector from "./connector";
import {
  FORWARDER_TYPES,
  FORWARDER_ABI,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
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
  Address,
  Action,
  AppIdentifier,
  AppCache,
  AppInterfaceCache,
  Entity,
  LabeledAppIdentifier,
  ForwardOptions,
  Permission,
  App,
  ActionFunction,
  PermissionMap,
  Function,
} from "./types";
import { ErrorException, ErrorInvalid, ErrorNotFound } from "./errors";

/**
 * The default main EVMcrispr class that expose all the functionalities.
 * @category Main
 */
export default class EVMcrispr {
  /**
   * The connector used to fetch Aragon apps.
   */
  #connector: Connector;
  /**
   * App cache that contains all the DAO's app.
   */
  #appCache: AppCache;
  #appInterfaceCache: AppInterfaceCache;
  #installedAppCounter: number;
  #signer: Signer;

  /**
   * An address used for permission operations that denotes any type of Ethereum account.
   */
  ANY_ENTITY: Address = "0x" + "F".repeat(40);

  /**
   * An address used for permission operations that denotes no Ethereum account.
   */
  NO_ENTITY: Address = constants.AddressZero;

  /**
   * Create a new EVMcrispr instance.
   * @param signer An ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers)
   * instance used to connect to Ethereum and sign any transaction needed.
   * @param chainId The id of the network to connect to.
   * @param options The optional configuration object.
   * @param options.ipfsUrlTemplate An IPFS gateway [URL Template](https://en.wikipedia.org/wiki/URI_Template) containing the
   * `{cid}` and `{path}` parameters used to fetch app artifacts.
   */
  constructor(
    signer: Signer,
    chainId: number,
    options: { ipfsUrlTemplate: string } = { ipfsUrlTemplate: IPFS_URI_TEMPLATE }
  ) {
    this.#connector = new Connector(chainId, options.ipfsUrlTemplate);
    this.#appCache = new Map();
    this.#appInterfaceCache = new Map();
    this.#installedAppCounter = 0;
    this.#signer = signer;
  }

  /**
   * Connect to a DAO by fetching and caching all its apps and permissions data.
   * It is necessary to connect to a DAO before doing anything else.
   * @param daoAddress The address of the DAO to connect to.
   */
  async connect(daoAddress: Address): Promise<void> {
    const [appCache, appResourcesCache] = await this._buildCaches(await this.#connector.organizationApps(daoAddress));

    this.#appCache = appCache;
    this.#appInterfaceCache = appResourcesCache;
  }

  get appCache() {
    return this.#appCache;
  }

  get connector() {
    return this.#connector;
  }

  /**
   * Encode an action that calls an app's contract function.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to call to.
   * @returns A proxy of the app that intercepts contract function calls and returns
   * the encoded call instead.
   */
  call(appIdentifier: AppIdentifier): any {
    return new Proxy(() => this._resolveApp(appIdentifier), {
      get: (getTargetApp: () => App, functionProperty: string) => {
        return (...params: any): ActionFunction => {
          try {
            return () => {
              const targetApp = getTargetApp();
              return {
                to: targetApp.address,
                data: targetApp.abiInterface.encodeFunctionData(functionProperty, this._resolveParams(params)),
              };
            };
          } catch (err) {
            throw new ErrorNotFound(`Function ${functionProperty} not found in app ${appIdentifier}`, {
              name: "ErrorFunctionNotFound",
            });
          }
        };
      },
    });
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to fetch.
   * @returns The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Function<Address> {
    return () => this._resolveApp(appIdentifier).address;
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps.
   * @param actionFunctions The array of action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options The forward options object.
   * @returns A promise that resolves to an object containing the encoded forwarding action as well as
   * any pre-transactions that need to be executed in advance.
   */
  async encode(
    actionFunctions: ActionFunction[],
    path: Entity[],
    options: ForwardOptions
  ): Promise<{ action: Action; preTxActions: Action[] }> {
    const actions = await normalizeActions(actionFunctions);
    // Need to build the evmscript starting from the last forwarder
    const forwarders = path.map((entity) => this._resolveEntity(entity)).reverse();
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
        if (feeTokenAddress === constants.AddressZero) {
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
        if (!options.context) {
          throw new ErrorInvalid(`Context option missing.`);
        }
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
   * @param identifier [[LabeledAppIdentifier | Identifier]] of the app to install.
   * @param initParams Parameters to initialize the app.
   * @returns A function which returns a promise that resolves to the installation action.
   */
  installNewApp(identifier: LabeledAppIdentifier, initParams: any[] = []): ActionFunction {
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
            permissionsMap.set(role.bytes, { manager: "", grantees: new Set() });
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
   * Encode a set of actions into one and send it in a transaction.
   * @param actions The action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options A forward options object.
   * @returns A promise that resolves to a receipt of the sent transaction.
   */
  async forward(
    actions: ActionFunction[],
    path: Entity[],
    options: ForwardOptions
  ): Promise<providers.TransactionReceipt> {
    const { action, preTxActions } = await this.encode(actions, path, options);

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
   * @param permission The permission to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager.
   * @returns A function that returns the permission action.
   */
  addPermission(permission: Permission, defaultPermissionManager: Entity): ActionFunction {
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
   * @param permissions The permissions to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager
   * of every permission created.
   * @returns A function that returns an array of permission actions.
   */
  addPermissions(permissions: Permission[], defaultPermissionManager: Entity): ActionFunction {
    return () => permissions.map((p) => this.addPermission(p, defaultPermissionManager)() as Action);
  }

  /**
   * Encode an action that revokes an app permission.
   * @param permission The permission to revoke.
   * @param removeManager A boolean that indicates whether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revokePermission(permission: Permission, removeManager = true): ActionFunction {
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
   * Encode a set of actions that revoke an app permission.
   * @param permissions The permissions to revoke.
   * @param removeManager A boolean that indicates wether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revokePermissions(permissions: Permission[], removeManager = true): ActionFunction {
    return () =>
      permissions.reduce((actions: Action[], permission) => {
        const action = this.revokePermission(permission, removeManager)() as Action[];
        return [...actions, ...action];
      }, []);
  }

  private _resolveApp(identifier: string): App {
    let resolvedIdentifier = resolveIdentifier(identifier);

    if (!this.#appCache.has(resolvedIdentifier)) {
      throw new ErrorNotFound(`App ${resolvedIdentifier} not found`, { name: "ErrorAppNotFound" });
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
