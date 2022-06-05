import { Contract, constants, utils } from 'ethers';
import type { BigNumber, Signer, providers } from 'ethers';

import { ErrorInvalid } from './errors';
import {
  FORWARDER_TYPES,
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
  Helpers,
  LabeledAppIdentifier,
  ParsedApp,
} from './types';
import Connector from './Connector';
import { IPFSResolver } from './IPFSResolver';
import { erc20ABI, forwarderABI } from './abis';
import resolver from './utils/resolvers';
import AragonOS from './modules/AragonOS';
import defaultHelpers from './helpers';

type TransactionReceipt = providers.TransactionReceipt;

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

  #helpers: Helpers;
  #env: Map<string, any> = new Map();
  /**
   * The connector used to fetch Aragon apps.
   */
  protected _connector: Connector;
  protected _ipfsResolver: IPFSResolver;
  #signer: Signer;

  aragon: AragonOS;

  resolver: any;

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
    this.#helpers = { ...defaultHelpers, ...options?.helpers };
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

  get helpers(): Helpers {
    return this.#helpers;
  }

  env(varName: string): any {
    return this.#env.get(varName);
  }

  set(varName: string, value: unknown): ActionFunction {
    return async () => {
      if (varName[0] !== '$') {
        throw new Error('Environment variables must start with $ symbol.');
      }
      this.#env.set(varName, value);
      return [];
    };
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
  ): Promise<{
    actions: Action[];
    forward: () => Promise<TransactionReceipt[]>;
  }> {
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
    const actions: Action[] = [];

    let script: string;
    let forwarderActions = await normalizeActions(actionFunctions)();
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
            actions.push({
              to: feeTokenAddress,
              data: feeToken.interface.encodeFunctionData('approve', [
                forwarderAddress,
                0,
              ]),
            });
          }
          if (allowance.eq(0)) {
            actions.push({
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

    actions.push({ ...forwarderActions[0], value });

    return {
      actions: actions,
      forward: () => this._forward(actions, options),
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
    options?: ForwardOptions,
  ): Promise<providers.TransactionReceipt[]> {
    const { actions: encodedActions } = await this.encode(
      actions,
      path,
      options,
    );
    return this._forward(encodedActions, options);
  }

  protected async _forward(
    actions: Action[],
    options?: ForwardOptions,
  ): Promise<TransactionReceipt[]> {
    const txs = [];
    for (const action of actions) {
      txs.push(
        await (
          await this.#signer.sendTransaction({
            ...action,
            gasPrice: options?.gasPrice,
            gasLimit: options?.gasLimit,
          })
        ).wait(),
      );
    }
    return txs;
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
