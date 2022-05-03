import { ipfsResolver as createIpfsResolver, IpfsResolver } from "@1hive/connect-core";
import { BigNumber, BigNumberish, constants, Contract, ethers, providers, Signer, utils } from "ethers";
import Connector from "./Connector";
import {
  buildApp,
  buildAppIdentifier,
  buildAppPermissions,
  buildIpfsTemplate,
  buildNonceForAddress,
  calculateNewProxyAddress,
  encodeActCall,
  encodeCallScript,
  erc20ABI,
  fetchAppArtifact,
  FORWARDER_TYPES,
  FORWARDER_ABI,
  getForwarderFee,
  getForwarderType,
  getFunctionParams,
  IPFS_GATEWAY,
  normalizeActions,
  normalizeRole,
  oracle,
  parseLabeledAppIdentifier,
  resolveIdentifier,
  isForwarder,
  toDecimals,
  timeUnits,
  buildAppArtifact,
} from "./helpers";
import {
  Address,
  Action,
  ActionFunction,
  ActionInterpreter,
  App,
  AppArtifactCache,
  AppCache,
  AppIdentifier,
  Entity,
  EVMcrisprOptions,
  ForwardOptions,
  LabeledAppIdentifier,
  Params,
  ParsedApp,
  Permission,
  PermissionP,
} from "./types";
import { ErrorException, ErrorInvalid, ErrorNotFound } from "./errors";

/**
 * The default main EVMcrispr class that expose all the functionalities.
 * @category Main
 */
export default class EVMcrispr {
  /**
   * App cache that contains all the DAO's app.
   */
  #appCache: AppCache;
  #appArtifactCache: AppArtifactCache;
  #addressBook: Map<string, Address>;
  /**
   * The connector used to fetch Aragon apps.
   */
  protected _connector: Connector;
  protected _ipfsResolver: IpfsResolver;
  #installedAppCounter: number;
  #newTokenCounter: number;
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
   * An address used for permission operations that denotes that the permission has been burnt.
   */
  BURN_ENTITY: Address = "0x" + "0".repeat(39) + "1";

  protected constructor(chainId: number, signer: Signer, options: EVMcrisprOptions) {
    this.#appCache = new Map();
    this.#appArtifactCache = new Map();
    this._connector = new Connector(chainId, { subgraphUrl: options.subgraphUrl });
    this.#addressBook = new Map();
    this.#installedAppCounter = 0;
    this.#newTokenCounter = 0;
    this._ipfsResolver = createIpfsResolver(buildIpfsTemplate(options.ipfsGateway));
    this.#signer = signer;
  }

  /**
   * Create a new EVMcrispr instance and connect it to a DAO by fetching and caching all its
   * apps and permissions data.
   * @param daoAddressOrName The name or address of the DAO to connect to.
   * @param signer An ether's [Signer](https://docs.ethers.io/v5/single-page/#/v5/api/signer/-%23-signers)
   * instance used to connect to Ethereum and sign any transaction needed.
   * @param options The optional configuration object.
   * @returns A promise that resolves to a new `EVMcrispr` instance.
   */
  static async create(
    daoAddressOrName: string,
    signer: Signer,
    options: EVMcrisprOptions = { ipfsGateway: IPFS_GATEWAY }
  ): Promise<EVMcrispr> {
    const evmcrispr = new EVMcrispr(await signer.getChainId(), signer, options);
    const networkName = (await signer.provider?.getNetwork())?.name;

    if (ethers.utils.isAddress(daoAddressOrName)) {
      await evmcrispr._connect(daoAddressOrName);
    } else {
      const daoAddress = await signer.resolveName(`${daoAddressOrName}.aragonid.eth`);
      if (!daoAddress) {
        throw new Error(
          `ENS ${daoAddressOrName}.aragonid.eth not found in ${
            networkName ?? "unknown network"
          }, please introduce the address of the DAO instead.`
        );
      }
      await evmcrispr._connect(daoAddress);
    }

    return evmcrispr;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get connector(): Connector {
    return this._connector;
  }

  get signer(): Signer {
    return this.#signer;
  }

  /**
   * Encode an action that creates a new app permission or grant it if it already exists.
   * @param permission The permission to create.
   * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager.
   * @returns A function that returns the permission action.
   */
  grant(permission: Permission | PermissionP, defaultPermissionManager: Entity): ActionFunction {
    return async () => {
      const [grantee, app, role, getParams = () => []] = permission;
      const [granteeAddress, appAddress, roleHash] = this.#resolvePermission([grantee, app, role]);

      if (!defaultPermissionManager) {
        throw new ErrorInvalid(`Permission not well formed, permission manager missing`, {
          name: "ErrorInvalidIdentifier",
        });
      }

      const params = getParams();
      const manager = this.#resolveEntity(defaultPermissionManager);
      const { permissions: appPermissions } = this.#resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this.#resolveApp("acl");
      const actions = [];

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}.`);
      }

      const appPermission = appPermissions.get(roleHash)!;

      // If the permission already existed and no parameters are needed, just grant to a new entity and exit
      if (appPermission.manager !== "" && appPermission.manager !== constants.AddressZero && params.length == 0) {
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
      if (appPermission.manager === "" || appPermission.manager === constants.AddressZero) {
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
          throw new ErrorException(`Grantee ${grantee} already has permission ${role}.`);
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
  grantPermissions(permissions: (Permission | PermissionP)[], defaultPermissionManager: Entity): ActionFunction {
    return normalizeActions(permissions.map((p) => this.grant(p, defaultPermissionManager)));
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to fetch.
   * @returns The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Address {
    return this.#resolveApp(appIdentifier).address;
  }

  /**
   * Returns the list of all (labeled and no labeled) app identifiers.
   * @returns List of available app identifiers
   */
  apps(): (AppIdentifier | LabeledAppIdentifier)[] {
    return [...this.#appCache.keys()];
  }

  appMethods(appIdentifier: AppIdentifier | LabeledAppIdentifier): string[] {
    console.log(
      "Warning: Function `evmcrispr.appMethods(identifier)` is experimental and may change in future releases."
    );
    return this.#appMethods(appIdentifier);
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
    return async () => {
      return this.forwardActions(agent, [this.encodeAction(target, signature, params)])();
    };
  }

  /**
   * Creates an action based on the passed parameters
   * @param target Action's to field
   * @param signature Function signature, such as mint(address,uint256)
   * @param params List of parameters passed to the function
   * @returns A function that returns the encoded action
   */
  encodeAction(target: Entity, signature: string, params: any[]): ActionFunction {
    return async () => {
      if (!/\w+\(((\w+(\[\d*\])*)+(,\w+(\[\d*\])*)*)?\)/.test(signature)) {
        throw new Error("Wrong signature format: " + signature + ".");
      }
      const paramTypes = signature.split("(")[1].slice(0, -1).split(",");
      return [
        {
          to: this.#resolveEntity(target),
          data: encodeActCall(signature, this.#resolveParams(params, paramTypes)),
        },
      ];
    };
  }

  /**
   * Send a set of transactions to a contract that implements the IForwarder interface
   * @param forwarder App identifier of the forwarder that is going to be used
   * @param actions List of actions that the forwarder is going to recieive
   * @returns A function that retuns the forward action
   */
  forwardActions(forwarder: AppIdentifier, actions: ActionFunction[]): ActionFunction {
    return async () => {
      const script = encodeCallScript(await normalizeActions(actions)());
      return [
        {
          to: this.#resolveEntity(forwarder),
          data: encodeActCall("forward(bytes)", [script]),
        },
      ];
    };
  }

  /**
   * Use DAO agent to perform a set of transactions using agent's execute function
   * @param agent App identifier of the agent that is going to be used to perform the actions
   * @param actions List of actions that the agent is going to perform
   * @returns A function that retuns an action to forward an agent call with the specified parameters
   */
  agentExec(agent: AppIdentifier, actions: ActionFunction[], useSafeExecute = false): ActionFunction {
    return async () => {
      return (
        await Promise.all(
          (
            await normalizeActions(actions)()
          ).map((action) =>
            useSafeExecute
              ? this.exec(agent).safeExecute(action.to, action.data)()
              : this.exec(agent).execute(action.to, action.value ?? 0, action.data)()
          )
        )
      ).flat();
    };
  }

  /**
   * Encode an action that calls an app's contract function.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to call to.
   * @returns A proxy of the app that intercepts contract function calls and returns
   * the encoded call instead.
   */
  exec(appIdentifier: AppIdentifier | LabeledAppIdentifier): any {
    const app = () => this.#resolveApp(appIdentifier);
    const appMethods = () => this.#appMethods(appIdentifier);
    return new Proxy(app, {
      ownKeys() {
        return appMethods();
      },
      getOwnPropertyDescriptor() {
        return {
          enumerable: true,
        };
      },
      get: (getTargetApp: () => App, functionName: string) => {
        try {
          const getCallData = (): [App, string[], string[]] => {
            const targetApp = getTargetApp();
            const [paramNames, paramTypes] = getFunctionParams(functionName, targetApp.abiInterface);
            return [targetApp, paramNames, paramTypes];
          };

          const fn = (...params: any): ActionFunction => {
            return async () => {
              const [targetApp, , paramTypes] = getCallData();
              return [
                {
                  to: targetApp.address,
                  data: targetApp.abiInterface.encodeFunctionData(
                    functionName,
                    this.#resolveParams(params, paramTypes)
                  ),
                },
              ];
            };
          };
          // Check in case we're calling a counterfactual app function
          if (this.appCache.has(resolveIdentifier(appIdentifier))) {
            const [, paramNames, paramTypes] = getCallData();

            Object.defineProperties(fn, {
              name: { value: functionName },
              paramNames: { value: paramNames },
              paramTypes: { value: paramTypes },
            });
          }

          return fn;
        } catch (err: any) {
          err.message = `Error when encoding call to method ${functionName} of app ${appIdentifier}: ${err.message}`;
          throw err;
        }
      },
    });
  }

  /**
   * Encode a set of actions into one using a path of forwarding apps.
   * @param actions The array of action-returning functions to encode.
   * @param path A group of forwarder app [[Entity | entities]] used to encode the actions.
   * @param options The forward options object.
   * @returns A promise that resolves to an object containing the encoded forwarding action as well as
   * any pre-transactions that need to be executed in advance.
   */
  async encode(
    actionFunctions: ActionFunction[] | ((evm: ActionInterpreter) => ActionFunction),
    path: Entity[],
    options?: ForwardOptions
  ): Promise<{ action: Action; preTxActions: Action[] }> {
    const _actionFunctions = Array.isArray(actionFunctions) ? actionFunctions : [actionFunctions(this)];
    if (_actionFunctions.length === 0) {
      throw new ErrorInvalid("No actions provided.");
    }
    if (path.length === 0) {
      throw new ErrorInvalid("No forwader apps path provided.");
    }
    // Need to build the evmscript starting from the last forwarder
    const forwarders = path.map((entity) => this.#resolveEntity(entity)).reverse();
    const actions = await normalizeActions(_actionFunctions)();
    const preTxActions: Action[] = [];

    let script: string;
    let forwarderActions = [...actions];
    let value = 0;

    for (let i = 0; i < forwarders.length; i++) {
      script = encodeCallScript(forwarderActions);
      const forwarderAddress = forwarders[i];
      const forwarder = new Contract(forwarderAddress, FORWARDER_ABI, this.#signer.provider);

      if (!(await isForwarder(forwarder))) {
        throw new ErrorInvalid(`App ${forwarder.address} is not a forwarder.`);
      }

      const fee = await getForwarderFee(forwarder);

      if (fee) {
        const [feeTokenAddress, feeAmount] = fee;

        // Check if fees are in ETH
        if (feeTokenAddress === constants.AddressZero) {
          value = feeAmount.toNumber();
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
            data: encodeActCall("forward(bytes,bytes)", [script, utils.hexlify(utils.toUtf8Bytes(options.context))]),
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
    actions: ActionFunction[] | ((evm: ActionInterpreter) => ActionFunction),
    path: Entity[],
    options?: ForwardOptions & { gasPrice?: BigNumberish; gasLimit?: BigNumberish }
  ): Promise<providers.TransactionReceipt> {
    const { action, preTxActions } = await this.encode(actions, path, options);
    // Execute pretransactions actions
    for (const action of preTxActions) {
      await (
        await this.#signer.sendTransaction({
          ...action,
          gasPrice: options?.gasPrice,
          gasLimit: options?.gasLimit,
        })
      ).wait();
    }

    return (
      await this.#signer.sendTransaction({
        ...action,
        gasPrice: options?.gasPrice,
        gasLimit: options?.gasLimit,
      })
    ).wait();
  }

  newToken(name: string, symbol: string, controller: Entity, decimals = 18, transferable = true): ActionFunction {
    const factories = new Map([
      [1, "0xA29EF584c389c67178aE9152aC9C543f9156E2B3"],
      [4, "0xad991658443c56b3dE2D7d7f5d8C68F339aEef29"],
      [100, "0xf7d36d4d46cda364edc85e5561450183469484c5"],
      [137, "0xcFed1594A5b1B612dC8199962461ceC148F14E68"],
    ]);
    const factory = new utils.Interface([
      "function createCloneToken(address _parentToken, uint _snapshotBlock, string _tokenName, uint8 _decimalUnits, string _tokenSymbol, bool _transfersEnabled) external returns (address)",
    ]);
    const controlled = new utils.Interface(["function changeController(address _newController) external"]);
    return async () => {
      const chainId = await this.signer.getChainId();
      if (!factories.has(chainId)) {
        throw new Error(`No MiniMeTokenFactory registered in network ${chainId}`);
      }

      await this.#registerNextProxyAddress(controller);
      const controllerAddress = this.#resolveEntity(controller);
      const nonce = await buildNonceForAddress(factories.get(chainId), this.#newTokenCounter++, this.#signer.provider!);
      const newTokenAddress = calculateNewProxyAddress(factories.get(chainId), nonce);
      this.#addressBook.set(`token:${symbol}`, newTokenAddress);
      return [
        {
          to: factories.get(chainId)!,
          data: factory.encodeFunctionData("createCloneToken", [
            ethers.constants.AddressZero,
            0,
            name,
            decimals,
            symbol,
            transferable,
          ]),
        },
        {
          to: newTokenAddress,
          data: controlled.encodeFunctionData("changeController", [controllerAddress]),
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
  install(identifier: LabeledAppIdentifier, initParams: any[] = []): ActionFunction {
    return async () => {
      try {
        const [appName, registry] = parseLabeledAppIdentifier(identifier);
        const appRepo = await this.connector.repo(appName, registry);
        const { codeAddress, contentUri, artifact: repoArtifact } = appRepo;

        if (!this.#appArtifactCache.has(codeAddress)) {
          const artifact = repoArtifact ?? (await fetchAppArtifact(this._ipfsResolver, contentUri));
          this.#appArtifactCache.set(codeAddress, buildAppArtifact(artifact));
        }

        const { abiInterface, roles } = this.#appArtifactCache.get(codeAddress)!;
        const kernel = this.#resolveApp("kernel");
        const [, types] = getFunctionParams("initialize", abiInterface);
        const encodedInitializeFunction = abiInterface.encodeFunctionData(
          "initialize",
          this.#resolveParams(initParams, types)
        );
        const appId = utils.namehash(`${appName}.${registry}`);
        if (!this.#addressBook.has(identifier)) {
          await this.#registerNextProxyAddress(identifier);
        }
        const proxyContractAddress = this.#resolveEntity(identifier);
        if (this.#appCache.has(identifier)) {
          throw new ErrorException(`Identifier ${identifier} is already in use.`);
        }

        this.#appCache.set(identifier, {
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
            data: kernel.abiInterface.encodeFunctionData("newAppInstance(bytes32,address,bytes,bool)", [
              appId,
              codeAddress,
              encodedInitializeFunction,
              false,
            ]),
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
      if (!apmRepo.endsWith(".eth")) {
        throw new ErrorException(`The APM repo must be an ENS name.`);
      }
      const kernel = this.#resolveApp("kernel");
      const KERNEL_APP_BASE_NAMESPACE = utils.id("base");
      const appId = utils.namehash(apmRepo);
      return [
        {
          to: kernel.address,
          data: kernel.abiInterface.encodeFunctionData("setApp(bytes32,bytes32,address)", [
            KERNEL_APP_BASE_NAMESPACE,
            appId,
            newAppAddress,
          ]),
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
      const [entityAddress, appAddress, roleHash] = this.#resolvePermission(permission);
      const { permissions: appPermissions } = this.#resolveApp(app);
      const { address: aclAddress, abiInterface: aclAbiInterface } = this.#resolveApp("acl");

      if (!appPermissions.has(roleHash)) {
        throw new ErrorNotFound(`Permission ${role} doesn't exists in app ${app}.`);
      }

      const appPermission = appPermissions.get(roleHash)!;

      if (!appPermission.grantees.has(entityAddress)) {
        throw new ErrorNotFound(`Entity ${grantee} doesn't have permission ${role} to be revoked.`, {
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
    return normalizeActions(permissions.map((p) => this.revoke(p, removeManager)));
  }

  /**
   * Encode a permission parameter array with an oracle.
   * @param entity The address or app identifier used as oracle
   * @returns A Params object that can be composed with other params or passed directly as a permission param
   */
  setOracle(entity: Entity): Params {
    return oracle(utils.isAddress(entity) ? entity : () => this.#resolveApp(entity).address);
  }

  #appMethods(appIdentifier: AppIdentifier | LabeledAppIdentifier): string[] {
    return (
      this.#appArtifactCache
        .get(this.#resolveApp(appIdentifier).codeAddress)
        ?.functions.map(({ sig }) => sig.split("(")[0])
        .filter((n) => n !== "initialize") || []
    );
  }

  async #buildAppArtifactCache(apps: ParsedApp[]): Promise<AppArtifactCache> {
    const appArtifactCache: AppArtifactCache = new Map();
    const artifactApps = apps.filter((app) => app.artifact);
    const artifactlessApps = apps.filter((app) => !app.artifact && app.contentUri);
    const contentUris = artifactlessApps.map((app) => app.contentUri);

    // Construct a contentUri => artifact map
    const uriToArtifactKeys = [...new Set<string>(contentUris)];
    const uriToArtifactValues: any[] = await Promise.all(
      uriToArtifactKeys.map((contentUri) => fetchAppArtifact(this._ipfsResolver, contentUri))
    );
    const uriToArtifactMap = Object.fromEntries(
      uriToArtifactKeys.map((_, i) => [uriToArtifactKeys[i], uriToArtifactValues[i]])
    );

    // Resolve all content uris to artifacts
    const artifacts: any[] = contentUris.map((uri) => uriToArtifactMap[uri]);

    artifactlessApps.forEach(({ codeAddress }, index) => {
      const artifact = artifacts[index];

      if (!appArtifactCache.has(codeAddress)) {
        appArtifactCache.set(codeAddress, buildAppArtifact(artifact));
      }
    });

    artifactApps.forEach(({ artifact, codeAddress }) => {
      if (!appArtifactCache.has(codeAddress)) {
        appArtifactCache.set(codeAddress, buildAppArtifact(artifact));
      }
    });

    return appArtifactCache;
  }

  async #buildAppCache(apps: App[]): Promise<AppCache> {
    const appCache: AppCache = new Map();
    const appCounter = new Map();

    const kernel = apps.find((app) => app.name.toLowerCase() === "kernel")!;
    const sortedParsedApps = [kernel];

    const addressToApp = apps.reduce((accumulator, app) => {
      accumulator.set(app.address, app);
      return accumulator;
    }, new Map());

    // Sort apps by creation time
    for (let i = 1; i <= addressToApp.size; i++) {
      const address = calculateNewProxyAddress(kernel.address, utils.hexlify(i));

      if (addressToApp.has(address)) {
        sortedParsedApps.push(addressToApp.get(address));
      }
    }

    // Create app cache
    for (const app of sortedParsedApps) {
      const { name } = app;
      const counter = appCounter.has(name) ? appCounter.get(name) : 0;
      const appIdentifier = buildAppIdentifier(app, counter);

      appCache.set(appIdentifier, app);
      appCounter.set(name, counter + 1);
    }

    return appCache;
  }

  protected async _connect(daoAddress: Address): Promise<void> {
    const parsedApps = await this._connector.organizationApps(daoAddress);
    const appResourcesCache = await this.#buildAppArtifactCache(parsedApps);
    const apps = parsedApps.map((parsedApp) => buildApp(parsedApp, appResourcesCache)).filter((app) => !!app);
    const appCache = await this.#buildAppCache(apps as App[]);

    this.#appCache = appCache;
    this.#appArtifactCache = appResourcesCache;
  }

  async #registerNextProxyAddress(identifier: string): Promise<void> {
    const kernel = this.#resolveApp("kernel");
    const nonce = await buildNonceForAddress(kernel.address, this.#installedAppCounter++, this.#signer.provider!);
    this.#addressBook.set(identifier, calculateNewProxyAddress(kernel.address, nonce));
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
      throw new ErrorNotFound(`App ${resolvedIdentifier} not found.`, { name: "ErrorAppNotFound" });
    }

    return this.#appCache.get(resolvedIdentifier)!;
  }

  #resolveEntity(entity: Entity): Address {
    switch (entity) {
      case "ANY_ENTITY":
        return this.ANY_ENTITY;
      case "NO_ENTITY":
      case "ETH":
      case "XDAI":
      case "ZERO_ADDRESS":
        return this.NO_ENTITY;
      case "BURN_ENTITY":
        return this.BURN_ENTITY;
      default:
        if (this.#addressBook.has(entity)) {
          return this.#addressBook.get(entity)!;
        }
        return utils.isAddress(entity) ? entity : this.#resolveApp(entity).address;
    }
  }

  #resolveNumber(number: string | number): BigNumber | number {
    if (typeof number === "string") {
      const [, amount, decimals = "0", unit] = number.match(/^(\d*(?:\.\d*)?)(?:e(\d+))?([s|m|h|d|w|y]?)$/)!;
      return toDecimals(amount, parseInt(decimals)).mul(timeUnits[unit] ?? 1);
    }
    return number;
  }

  #resolveBoolean(boolean: string | boolean): boolean {
    if (typeof boolean === "string") {
      if (boolean === "false") {
        return false;
      }
      if (boolean === "true") {
        return true;
      }
      throw new Error(`Parameter should be a boolean ("true" or "false"), "${boolean}" given.`);
    }
    return !!boolean;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  #resolveBytes(bytes: any, max = 0): string {
    if (typeof bytes === "string" && !bytes.startsWith("0x")) {
      bytes = utils.hexlify(utils.toUtf8Bytes(bytes)).padEnd(max * 2 + 2, "0");
    }
    bytes = bytes.toString();
    if (!bytes.startsWith("0x") || (bytes.length > max * 2 + 2 && max > 0)) {
      throw new Error(`Parameter should contain less than ${max} bytes.`);
    }
    return bytes;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  #resolveParam(param: any, type: string): any {
    if (/\[\d*\]$/g.test(type)) {
      if (!Array.isArray(param)) {
        throw new Error(`Parameter ${type} should be an array, ${param} given.`);
      }
      return param.map((param: any[]) => this.#resolveParam(param, type.slice(0, type.lastIndexOf("["))));
    }
    if (type === "address") {
      return this.#resolveEntity(param);
    }
    if (/^u?int(\d)*$/.test(type)) {
      return this.#resolveNumber(param);
    }
    if (type === "bool") {
      return this.#resolveBoolean(param);
    }
    if (/^bytes(\d*)$/.test(type)) {
      return this.#resolveBytes(param, parseInt(type.match(/^bytes(\d*)$/)![1] || "0"));
    }
    return param;
  }

  #resolveParams(params: any[], types: string[]): any[] {
    return params
      .map((param) => (param instanceof Function ? param() : param))
      .map((param, i) => this.#resolveParam(param, types[i]));
  }

  #resolvePermission(permission: Permission): [Address, Address, string] {
    if (!permission[0]) {
      throw new ErrorInvalid(`Permission not well formed, grantee missing`, {
        name: "ErrorInvalidIdentifier",
      });
    }
    if (!permission[1]) {
      throw new ErrorInvalid(`Permission not well formed, app missing`, {
        name: "ErrorInvalidIdentifier",
      });
    }
    if (!permission[2]) {
      throw new ErrorInvalid(`Permission not well formed, role missing`, {
        name: "ErrorInvalidIdentifier",
      });
    }
    return permission.map((entity, index) =>
      index < permission.length - 1 ? this.#resolveEntity(entity) : normalizeRole(entity)
    ) as [Address, Address, string];
  }
}
