import { Contract, constants, utils } from 'ethers';
import type { BigNumber, BigNumberish, Signer, providers } from 'ethers';

import { ErrorInvalid } from './errors';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  FORWARDER_TYPES,
  NO_ENTITY,
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  buildIpfsTemplate,
  calculateNewProxyAddress,
  encodeActCall,
  encodeCallScript,
  fetchAppArtifact,
  getAragonEnsResolver,
  getForwarderFee,
  getForwarderType,
  isForwarder,
  normalizeActions,
  resolveName,
} from './utils';
import type {
  Action,
  ActionFunction,
  Address,
  App,
  AppArtifactCache,
  AppCache,
  AppIdentifier,
  EVMcrisprOptions,
  Entity,
  ForwardOptions,
  LabeledAppIdentifier,
  Params,
  ParsedApp,
  Permission,
  PermissionP,
} from './types';
import Connector from './Connector';
import { IPFSResolver } from './IPFSResolver';
import { erc20ABI, forwarderABI } from './abis';
import resolver from './utils/resolvers';
import AragonOS from './modules/AragonOS';

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
  protected _ipfsResolver: IPFSResolver;
  #signer: Signer;

  aragon: AragonOS;

  resolver: any;

  /**
   * An address used for permission operations that denotes any type of Ethereum account.
   */
  ANY_ENTITY: Address = ANY_ENTITY;

  /**
   * An address used for permission operations that denotes no Ethereum account.
   */
  NO_ENTITY: Address = NO_ENTITY;

  /**
   * An address used for permission operations that denotes that the permission has been burnt.
   */
  BURN_ENTITY: Address = BURN_ENTITY;

  protected constructor(
    chainId: number,
    signer: Signer,
    options: EVMcrisprOptions,
  ) {
    this.#appCache = new Map();
    this.#appArtifactCache = new Map();
    this._connector = new Connector(chainId, {
      subgraphUrl: options.subgraphUrl,
    });
    this.#addressBook = new Map();
    this._ipfsResolver = new IPFSResolver(
      buildIpfsTemplate(options.ipfsGateway),
    );
    this.#signer = signer;
    this.resolver = resolver(this);
    this.aragon = new AragonOS(this);
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
    options: EVMcrisprOptions = {},
  ): Promise<EVMcrispr> {
    const chainId = await signer.getChainId();
    const evmcrispr = new EVMcrispr(chainId, signer, options);
    const networkName = (await signer.provider?.getNetwork())?.name;

    if (utils.isAddress(daoAddressOrName)) {
      await evmcrispr._connect(daoAddressOrName);
    } else {
      const daoAddress = await resolveName(
        `${daoAddressOrName}.aragonid.eth`,
        options.ensResolver || getAragonEnsResolver(chainId),
        signer,
      );
      if (!daoAddress) {
        throw new Error(
          `ENS ${daoAddressOrName}.aragonid.eth not found in ${
            networkName ?? 'unknown network'
          }, please introduce the address of the DAO instead.`,
        );
      }
      await evmcrispr._connect(daoAddress);
    }

    return evmcrispr;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get appArtifactCache(): AppArtifactCache {
    return this.#appArtifactCache;
  }

  get ipfsResolver(): IPFSResolver {
    return this._ipfsResolver;
  }

  get connector(): Connector {
    return this._connector;
  }

  get signer(): Signer {
    return this.#signer;
  }

  get addressBook(): Map<string, string> {
    return this.#addressBook;
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
    return this.aragon.grant(permission, defaultPermissionManager);
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
    return this.aragon.grantPermissions(permissions, defaultPermissionManager);
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to fetch.
   * @returns The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Contract {
    const app = this.resolver.resolveApp(appIdentifier);
    return new Contract(app.address, app.abiInterface, this.#signer);
  }

  /**
   * Returns the list of all (labeled and no labeled) app identifiers.
   * @returns List of available app identifiers
   */
  apps(): (AppIdentifier | LabeledAppIdentifier)[] {
    return [...this.#appCache.keys()];
  }

  appMethods(appIdentifier: AppIdentifier | LabeledAppIdentifier): string[] {
    return (
      this.#appArtifactCache
        .get(this.resolver.resolveApp(appIdentifier).codeAddress)
        ?.functions.map(({ sig }) => sig.split('(')[0])
        .filter((n) => n !== 'initialize') || []
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
    return this.aragon.act(agent, target, signature, params);
  }

  /**
   * Creates an action based on the passed parameters
   * @param target Action's to field
   * @param signature Function signature, such as mint(address,uint256)
   * @param params List of parameters passed to the function
   * @returns A function that returns the encoded action
   */
  encodeAction(
    target: Entity,
    signature: string,
    params: any[],
  ): ActionFunction {
    return async () => {
      if (!/\w+\(((\w+(\[\d*\])*)+(,\w+(\[\d*\])*)*)?\)/.test(signature)) {
        throw new Error('Wrong signature format: ' + signature + '.');
      }
      const paramTypes = signature.split('(')[1].slice(0, -1).split(',');
      return [
        {
          to: this.resolver.resolveEntity(target),
          data: encodeActCall(
            signature,
            this.resolver.resolveParams(params, paramTypes),
          ),
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
  forwardActions(
    forwarder: AppIdentifier,
    actions: ActionFunction[],
  ): ActionFunction {
    return async () => {
      const script = encodeCallScript(await normalizeActions(actions)());
      return [
        {
          to: this.resolver.resolveEntity(forwarder),
          data: encodeActCall('forward(bytes)', [script]),
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
  agentExec(
    agent: AppIdentifier,
    actions: ActionFunction[],
    useSafeExecute = false,
  ): ActionFunction {
    return this.aragon.agentExec(agent, actions, useSafeExecute);
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
    params: any[],
  ): ActionFunction {
    return this.aragon.exec(appIdentifier, functionName, params);
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
    actionFunctions: ActionFunction[],
    path: Entity[],
    options?: ForwardOptions,
  ): Promise<{ action: Action; preTxActions: Action[] }> {
    if (actionFunctions.length === 0) {
      throw new ErrorInvalid('No actions provided.');
    }
    if (path.length === 0) {
      throw new ErrorInvalid('No forwader apps path provided.');
    }
    // Need to build the evmscript starting from the last forwarder
    const forwarders = path
      .map((entity) => this.resolver.resolveEntity(entity))
      .reverse();
    const actions = await normalizeActions(actionFunctions)();
    const preTxActions: Action[] = [];

    let script: string;
    let forwarderActions = [...actions];
    let value = 0;

    for (let i = 0; i < forwarders.length; i++) {
      script = encodeCallScript(forwarderActions);
      const forwarderAddress = forwarders[i];
      const forwarder = new Contract(
        forwarderAddress,
        forwarderABI,
        this.#signer.provider,
      );

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
          const feeToken = new Contract(
            feeTokenAddress,
            erc20ABI,
            this.#signer.provider,
          );
          const allowance = (await feeToken.allowance(
            await this.#signer.getAddress(),
            forwarderAddress,
          )) as BigNumber;

          if (allowance.gt(0) && allowance.lt(feeAmount)) {
            preTxActions.push({
              to: feeTokenAddress,
              data: feeToken.interface.encodeFunctionData('approve', [
                forwarderAddress,
                0,
              ]),
            });
          }
          if (allowance.eq(0)) {
            preTxActions.push({
              to: feeTokenAddress,
              data: feeToken.interface.encodeFunctionData('approve', [
                forwarderAddress,
                feeAmount,
              ]),
            });
          }
        }
      }

      if (
        (await getForwarderType(forwarder)) === FORWARDER_TYPES.WITH_CONTEXT
      ) {
        if (!options?.context) {
          throw new ErrorInvalid(`Context option missing.`);
        }
        forwarderActions = [
          {
            to: forwarderAddress,
            data: encodeActCall('forward(bytes,bytes)', [
              script,
              utils.hexlify(utils.toUtf8Bytes(options?.context || '')),
            ]),
          },
        ];
      } else {
        forwarderActions = [
          {
            to: forwarderAddress,
            data: encodeActCall('forward(bytes)', [script]),
          },
        ];
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
    actions: ActionFunction[],
    path: Entity[],
    options?: ForwardOptions & {
      gasPrice?: BigNumberish;
      gasLimit?: BigNumberish;
    },
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

  newToken(
    name: string,
    symbol: string,
    controller: Entity,
    decimals = 18,
    transferable = true,
  ): ActionFunction {
    return this.aragon.newToken(
      name,
      symbol,
      controller,
      decimals,
      transferable,
    );
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
    return this.aragon.install(identifier, initParams);
  }

  /**
   * Upgrade all installed apps of a specific APM repo to a new implementation contract.
   * @param apmRepo ENS name of the APM repository
   * @param newAppAddress Address of the new implementation contract
   * @returns A function that returns the upgrade action
   */
  upgrade(apmRepo: string, newAppAddress: Address): ActionFunction {
    return this.aragon.upgrade(apmRepo, newAppAddress);
  }

  /**
   * Encode an action that revokes an app permission.
   * @param permission The permission to revoke.
   * @param removeManager A boolean that indicates whether or not to remove the permission manager.
   * @returns A function that returns the revoking actions.
   */
  revoke(permission: Permission, removeManager = false): ActionFunction {
    return this.aragon.revoke(permission, removeManager);
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
    return this.aragon.revokePermissions(permissions, removeManager);
  }

  /**
   * Encode a permission parameter array with an oracle.
   * @param entity The address or app identifier used as oracle
   * @returns A Params object that can be composed with other params or passed directly as a permission param
   */
  setOracle(entity: Entity): Params {
    return this.aragon.setOracle(entity);
  }

  async #buildAppArtifactCache(apps: ParsedApp[]): Promise<AppArtifactCache> {
    const appArtifactCache: AppArtifactCache = new Map();
    const artifactApps = apps.filter((app) => app.artifact);
    const artifactlessApps = apps.filter(
      (app) => !app.artifact && app.contentUri,
    );
    const contentUris = artifactlessApps.map((app) => app.contentUri);

    // Construct a contentUri => artifact map
    const uriToArtifactKeys = [...new Set<string>(contentUris)];
    const uriToArtifactValues: any[] = await Promise.all(
      uriToArtifactKeys.map((contentUri) =>
        fetchAppArtifact(this._ipfsResolver, contentUri),
      ),
    );
    const uriToArtifactMap = Object.fromEntries(
      uriToArtifactKeys.map((_, i) => [
        uriToArtifactKeys[i],
        uriToArtifactValues[i],
      ]),
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

    const kernel = apps.find((app) => app.name.toLowerCase() === 'kernel')!;
    const sortedParsedApps = [kernel];

    const addressToApp = apps.reduce((accumulator, app) => {
      accumulator.set(app.address, app);
      return accumulator;
    }, new Map());

    // Sort apps by creation time
    for (let i = 1; i <= addressToApp.size; i++) {
      const address = calculateNewProxyAddress(
        kernel.address,
        utils.hexlify(i),
      );

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
    const apps = parsedApps
      .map((parsedApp) => buildApp(parsedApp, appResourcesCache))
      .filter((app) => !!app);
    const appCache = await this.#buildAppCache(apps as App[]);

    this.#appCache = appCache;
    this.#appArtifactCache = appResourcesCache;
  }
}
