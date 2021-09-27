import { BigNumber, constants, Contract, providers, Signer, utils } from "ethers";
import Connector from "./Connector";
import {
  FORWARDER_TYPES,
  FORWARDER_ABI,
  getForwarderFee,
  getForwarderType,
  encodeActCall,
  encodeCallScript,
  erc20ABI,
  TX_GAS_LIMIT,
  TX_GAS_PRICE,
  buildNonceForAddress,
  calculateNewProxyAddress,
  normalizeActions,
  normalizeRole,
  IPFS_GATEWAY,
  resolveIdentifier,
  parseLabeledAppIdentifier,
  isForwarder,
  buildAppIdentifier,
  buildIpfsTemplate,
  toDecimals,
  functionParamTypes,
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
  PermissionP,
  App,
  ActionFunction,
  PermissionMap,
  Params,
} from "./types";
import { ErrorException, ErrorInvalid, ErrorNotFound } from "./errors";
import { oracle } from "./acl-utils";
import { ActionInterpreter } from "src";

/**
 * The default main EVMcrispr class that expose all the functionalities.
 * @category Main
 */
export default class EVMcrispr {
  /**
   * App cache that contains all the DAO's app.
   */
  #appCache: AppCache;
  #appInterfaceCache: AppInterfaceCache;
  /**
   * The connector used to fetch Aragon apps.
   */
  #connector: Connector;
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

  private constructor(signer: Signer, chainId: number, options: { ipfsGateway: string }) {
    this.#connector = new Connector(chainId, buildIpfsTemplate(options.ipfsGateway));
    this.#appCache = new Map();
    this.#appInterfaceCache = new Map();
    this.#installedAppCounter = 0;
    this.#signer = signer;
  }

  /**
   * Create a new EVMcrispr instance and connect it to a DAO by fetching and caching all its
   * apps and permissions data.
   * @param signer An ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers)
   * instance used to connect to Ethereum and sign any transaction needed.
   * @param daoAddress The address of the DAO to connect to.
   * @param options The optional configuration object.
   * @param options.ipfsGateway An IPFS gateway to fetch app data from.
   * @returns A promise that resolves to a new `EVMcrispr` instance.
   */
  static async create(
    signer: Signer,
    daoAddress: Address,
    options: { ipfsGateway: string } = { ipfsGateway: IPFS_GATEWAY }
  ): Promise<EVMcrispr> {
    const evmcrispr = new EVMcrispr(signer, await signer.getChainId(), options);

    await evmcrispr.#connect(daoAddress);

    return evmcrispr;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get connector(): Connector {
    return this.#connector;
  }

  /**
   * Encode an action that creates a new app permission or grant it if it already exists.
   * @param permission The permission to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager.
   * @returns A function that returns the permission action.
   */
  addPermission(permission: Permission | PermissionP, defaultPermissionManager: Entity): ActionFunction {
    return () => {
      const [grantee, app, role, getParams = () => []] = permission;
      const params = getParams();
      const [granteeAddress, appAddress, roleHash] = this.#resolvePermission([grantee, app, role]);
      const manager = this.#resolveEntity(defaultPermissionManager);
      const { permissions: appPermissions } = this.#resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this.#resolveApp("acl");
      const actions = [];

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      const appPermission = appPermissions.get(roleHash)!;

      // If the permission already existed and no parameters are needed, just grant to a new entity and exit
      if (appPermission.grantees.size && params.length == 0) {
        if (appPermission.grantees.has(granteeAddress)) {
          throw new ErrorException(`Grantee ${grantee} already has permission ${role}`);
        }
        appPermission.grantees.add(granteeAddress);

        return [
          {
            to: aclAddress,
            data: aclAbiInterface.encodeFunctionData("grantPermission", [granteeAddress, appAddress, roleHash]),
          },
        ];
      }

      // If the permission does not exist previously, create it
      if (!appPermission.grantees.size) {
        appPermissions.set(roleHash, {
          manager,
          grantees: new Set([granteeAddress]),
        });

        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData("createPermission", [granteeAddress, appAddress, roleHash, manager]),
        });
      }

      // If we need to set up parameters we call the grantPermissionP function, even if we just created the permission
      if (params.length > 0) {
        if (appPermission.grantees.has(granteeAddress)) {
          throw new ErrorException(`Grantee ${grantee} already has permission ${role}`);
        }
        appPermission.grantees.add(granteeAddress);

        actions.push({
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData("grantPermissionP", [granteeAddress, appAddress, roleHash, params]),
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
  addPermissions(permissions: (Permission | PermissionP)[], defaultPermissionManager: Entity): ActionFunction {
    return () => permissions.map((p) => this.addPermission(p, defaultPermissionManager)() as Action).flat();
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to fetch.
   * @returns The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): () => Address {
    return () => this.#resolveApp(appIdentifier).address;
  }

  /**
   * Use DAO agent to call an external contract function
   * @param agent App identifier of the agent that is going to be used to call the function
   * @param target Address of the external contract
   * @param signature Function signature that is going to be called
   * @param params Array of parameters that are going to be used to call the function
   * @returns A function that retuns an action to forward an agent call with the specified parameters
   */
  act(agent: AppIdentifier, target: Entity, signature: string, params: any[]): ActionFunction {
    if (!/\w+\(((\w+(\[\])*)+(,\w+(\[\])*)*)?\)/.test(signature)) {
      throw new Error("Wrong signature format: " + signature);
    }
    return () => {
      const paramTypes = signature.split("(")[1].slice(0, -1).split(",");
      const script = encodeCallScript([
        {
          to: this.#resolveEntity(target),
          data: encodeActCall(signature, this.#resolveParams(params, paramTypes)),
        },
      ]);
      return {
        to: this.#resolveEntity(agent),
        data: encodeActCall("forward(bytes)", [script]),
      };
    };
  }

  /**
   * Encode an action that calls an app's contract function.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to call to.
   * @returns A proxy of the app that intercepts contract function calls and returns
   * the encoded call instead.
   */
  call(appIdentifier: AppIdentifier | LabeledAppIdentifier): any {
    return new Proxy(() => this.#resolveApp(appIdentifier), {
      get: (getTargetApp: () => App, functionName: string) => {
        return (...params: any): ActionFunction => {
          return () => {
            try {
              const targetApp = getTargetApp();
              const paramTypes = functionParamTypes(functionName, targetApp.abi);
              return {
                to: targetApp.address,
                data: targetApp.abiInterface.encodeFunctionData(functionName, this.#resolveParams(params, paramTypes)),
              };
            } catch (err: any) {
              err.message = `Error when encoding call to method ${functionName} of app ${appIdentifier}: ${err.message}`;
              throw err;
            }
          };
        };
      },
    });
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps.
   * @param _actionFunctions The array of action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options The forward options object.
   * @returns A promise that resolves to an object containing the encoded forwarding action as well as
   * any pre-transactions that need to be executed in advance.
   */
  async encode(
    actionFunctions: ActionFunction[] | ((evm: ActionInterpreter) => ActionFunction[]),
    path: Entity[],
    options?: ForwardOptions
  ): Promise<{ action: Action; preTxActions: Action[] }> {
    const _actionFunctions = Array.isArray(actionFunctions) ? actionFunctions : actionFunctions(this);
    if (_actionFunctions.length === 0) {
      throw new ErrorInvalid("No actions provided");
    }
    if (path.length === 0) {
      throw new ErrorInvalid("No forwader apps path provided");
    }
    // Need to build the evmscript starting from the last forwarder
    const forwarders = path.map((entity) => this.#resolveEntity(entity)).reverse();
    const actions = await normalizeActions(_actionFunctions);
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
        if (!options?.context) {
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
   * Encode a set of actions into one and send it in a transaction.
   * @param actions The action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options A forward options object.
   * @returns A promise that resolves to a receipt of the sent transaction.
   */
  async forward(
    actions: ActionFunction[] | ((evm: ActionInterpreter) => ActionFunction[]),
    path: Entity[],
    options?: ForwardOptions
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
        const kernel = this.#resolveApp("kernel");
        const abiInterface = new utils.Interface(appArtifact.abi);
        const types = functionParamTypes("initialize", appArtifact.abi);
        const encodedInitializeFunction = abiInterface.encodeFunctionData(
          "initialize",
          this.#resolveParams(initParams, types)
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
          abi: appArtifact.abi,
          // Set a reference to the app interface
          abiInterface: this.#appInterfaceCache.get(codeAddress)!,
          address: proxyContractAddress,
          codeAddress,
          contentUri,
          name: appName,
          permissions: appArtifact.roles.reduce((permissionsMap: PermissionMap, role: any) => {
            permissionsMap.set(role.bytes, { manager: "", grantees: new Set() });
            return permissionsMap;
          }, new Map()),
          registryName: registry,
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
      } catch (err: any) {
        err.message = `Error when encoding ${identifier} installation action: ${err.message}`;
        throw err;
      }
    };
  }

  /**
   * Encode an action that revokes an app permission.
   * @param permission The permission to revoke.
   * @param removeManager A boolean that indicates whether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revokePermission(permission: Permission, removeManager = false): ActionFunction {
    return () => {
      const actions = [];
      const [grantee, app, role] = permission;
      const [entityAddress, appAddress, roleHash] = this.#resolvePermission(permission);
      const { permissions: appPermissions } = this.#resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this.#resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}`);
      }

      const appPermission = appPermissions.get(roleHash)!;

      if (!appPermission.grantees.has(entityAddress)) {
        throw new ErrorNotFound(`Entity ${grantee} doesn't have permission ${role} to be revoked`, {
          name: "ErrorPermissionNotFound",
        });
      }

      appPermission.grantees.delete(entityAddress);

      actions.push({
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData("revokePermission", [entityAddress, appAddress, roleHash]),
      });

      if (removeManager) {
        delete appPermission.manager;
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
  revokePermissions(permissions: Permission[], removeManager = false): ActionFunction {
    return () =>
      permissions.reduce((actions: Action[], permission) => {
        const action = this.revokePermission(permission, removeManager)() as Action[];
        return [...actions, ...action];
      }, []);
  }

  /**
   * Encode a permission parameter array with an oracle.
   * @param entity The address or app identifier used as oracle
   * @returns A Params object that can be composed with other params or passed directly as a permission param
   */
  setOracle(entity: Entity): Params {
    return oracle(utils.isAddress(entity) ? entity : this.app(entity));
  }

  async #buildCaches(apps: App[]): Promise<[AppCache, AppInterfaceCache]> {
    const appCache: AppCache = new Map();
    const appInterfaceCache: AppInterfaceCache = new Map();
    const appCounter = new Map();
    const kernel = apps.find((app) => app.name.toLowerCase() === "kernel")!;
    const kernelTxCount = await this.#signer.provider!.getTransactionCount(kernel.address);
    const sortedApps = [kernel];

    const addressToApp = apps.reduce((accumulator, app) => {
      accumulator.set(app.address, app);
      return accumulator;
    }, new Map());

    // Sort apps by creation time
    for (let i = 1; i < kernelTxCount; i++) {
      const address = calculateNewProxyAddress(kernel.address, utils.hexlify(i));

      if (addressToApp.has(address)) {
        sortedApps.push(addressToApp.get(address));
      }
    }

    for (const app of sortedApps) {
      const { name, codeAddress, abi } = app;
      const counter = appCounter.has(name) ? appCounter.get(name) : 0;
      const appIdentifier = buildAppIdentifier(app, counter);

      if (!appInterfaceCache.has(codeAddress)) {
        appInterfaceCache.set(codeAddress, new utils.Interface(abi));
      }
      // Set reference to app interface
      app.abiInterface = appInterfaceCache.get(codeAddress)!;

      appCache.set(appIdentifier, app);
      appCounter.set(name, counter + 1);
    }

    return [appCache, appInterfaceCache];
  }

  async #connect(daoAddress: Address): Promise<void> {
    const [appCache, appResourcesCache] = await this.#buildCaches(await this.#connector.organizationApps(daoAddress));

    this.#appCache = appCache;
    this.#appInterfaceCache = appResourcesCache;
  }

  #resolveApp(entity: Entity): App {
    if (utils.isAddress(entity)) {
      const app = [...this.#appCache.entries()].find(([, app]) => app.address === entity);

      if (!app) {
        throw new ErrorNotFound(`Address ${entity} doesn't match any app.`, { name: "ErrorAppNotFound" });
      }

      return app[1];
    }
    const resolvedIdentifier = resolveIdentifier(entity);

    if (!this.#appCache.has(resolvedIdentifier)) {
      throw new ErrorNotFound(`App ${resolvedIdentifier} not found`, { name: "ErrorAppNotFound" });
    }

    return this.#appCache.get(resolvedIdentifier)!;
  }

  #resolveEntity(entity: Entity): Address {
    return utils.isAddress(entity) ? entity : this.app(entity)();
  }

  #resolveNumber(number: string | number): BigNumber | number {
    if (typeof number === "string") {
      const [, amount, decimals = "0"] = number.match(/^(\d*(?:\.\d*)?)(?:e(\d+))?$/)!;
      return toDecimals(amount, parseInt(decimals));
    }
    return number;
  }

  #resolveParam(param: any, type: string): any {
    if (type.endsWith("[]")) {
      if (!Array.isArray(param)) {
        throw new Error(`Parameter ${type} should be an array, ${param} given.`);
      }
      return param.map((param: any[]) => this.#resolveParam(param, type.slice(0, -2)));
    }
    if (type === "address") {
      return this.#resolveEntity(param);
    }
    if (/^u?int(\d)*$/.test(type)) {
      return this.#resolveNumber(param);
    }
    return param;
  }

  #resolveParams(params: any[], types: string[]): any[] {
    return params
      .map((param) => (param instanceof Function ? param() : param))
      .map((param, i) => this.#resolveParam(param, types[i]));
  }

  #resolvePermission(permission: Permission): [Address, Address, string] {
    return permission.map((entity, index) =>
      index < permission.length - 1 ? this.#resolveEntity(entity) : normalizeRole(entity)
    ) as [Address, Address, string];
  }
}
