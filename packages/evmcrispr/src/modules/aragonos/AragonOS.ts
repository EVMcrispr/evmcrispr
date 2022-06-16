import { Contract, utils } from 'ethers';

import type EVMcrispr from '../../EVMcrispr';
import type {
  ActionFunction,
  Address,
  App,
  AppArtifactCache,
  AppCache,
  AppIdentifier,
  Entity,
  Helper,
  LabeledAppIdentifier,
  Params,
  ParsedApp,
  Permission,
  PermissionP,
} from '../../types';
import { connect } from './commands/connect';
import { act } from './commands/act';
import { grant } from './commands/grant';
import { install } from './commands/install';
import { newDao } from './commands/new-dao';
import { newToken } from './commands/new-token';
import { revoke } from './commands/revoke';
import { upgrade } from './commands/upgrade';
import {
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  buildNonceForAddress,
  calculateNewProxyAddress,
  fetchAppArtifact,
  oracle,
  resolveIdentifier,
} from '../../utils';
import Connector from './utils/Connector';
import { ErrorNotFound } from '../../errors';
import { exec } from './commands/exec';
import helpers from './helpers';
import aragonEns from './helpers/aragonEns';

export default class AragonOS {
  evm: EVMcrispr;
  #helpers: { [name: string]: Helper };

  constructor(evm: EVMcrispr) {
    this.evm = evm;
    this.#helpers = helpers(evm);
  }

  get helpers() {
    return this.#helpers;
  }

  dao(name: string) {
    return AragonOS._connectAddressOrName(this, name);
  }

  connect(
    dao: string,
    actions: (dao: ConnectedAragonOS) => ActionFunction[],
    path: string[],
    opts?: { context: string },
  ): ActionFunction {
    return connect(this, dao, actions, path, opts);
  }

  newDao(name: string): ActionFunction {
    return newDao(this, name);
  }

  protected static async _connect(
    module: AragonOS,
    daoAddress: Address,
  ): Promise<ConnectedAragonOS> {
    const _dao = await ConnectedAragonOS.create(module.evm, daoAddress);
    for (const app of _dao.apps()) {
      // if (app.endsWith(':0')) {
      //   module.evm.addressBook.set(app.substring(0, app.length - 2), _dao.resolveApp(app).address)
      // }
      module.evm.addressBook.set(app, _dao.resolveApp(app).address);
    }
    return _dao;
  }

  protected static async _connectAddressOrName(
    module: AragonOS,
    daoAddressOrName: string,
  ): Promise<ConnectedAragonOS> {
    const networkName = (await module.evm.signer.provider?.getNetwork())?.name;

    if (utils.isAddress(daoAddressOrName)) {
      return ConnectedAragonOS._connect(module, daoAddressOrName);
    } else {
      const daoAddress = await aragonEns(
        module.evm,
        `${daoAddressOrName}.aragonid.eth`,
        module.evm.env('$aragonos.ensResolver'),
      );
      if (!daoAddress) {
        throw new Error(
          `ENS ${daoAddressOrName}.aragonid.eth not found in ${
            networkName ?? 'unknown network'
          }, please introduce the address of the DAO instead.`,
        );
      }
      return ConnectedAragonOS._connect(module, daoAddress);
    }
  }
}

export class ConnectedAragonOS extends AragonOS {
  /**
   * App cache that contains all the DAO's app.
   */
  #appCache: AppCache;
  #appArtifactCache: AppArtifactCache;
  /**
   * The connector used to fetch Aragon apps.
   */
  protected _connector: Connector;

  constructor(evm: EVMcrispr, chainId: number, subgraphUrl: string) {
    super(evm);
    this.#appCache = new Map();
    this.#appArtifactCache = new Map();
    this._connector = new Connector(chainId, {
      subgraphUrl,
    });
  }

  static async create(
    evm: EVMcrispr,
    daoAddress: string,
  ): Promise<ConnectedAragonOS> {
    const dao = new ConnectedAragonOS(
      evm,
      await evm.signer.getChainId(),
      evm.env('$aragonos.subgraphUrl'),
    );
    const parsedApps = await dao._connector.organizationApps(daoAddress);
    const appResourcesCache = await dao.#buildAppArtifactCache(parsedApps);
    const apps = parsedApps
      .map((parsedApp: ParsedApp) => buildApp(parsedApp, appResourcesCache))
      .filter((app: App | null) => !!app);
    const appCache = await dao.#buildAppCache(apps as App[]);

    dao.#appCache = appCache;
    dao.#appArtifactCache = appResourcesCache;
    return dao;
  }

  act(
    agent: string,
    target: string,
    signature: string,
    params: any[],
  ): ActionFunction {
    return act(this, agent, target, signature, params);
  }

  exec(target: Entity, method: string, params: any[]): ActionFunction {
    return exec(this, target, method, params);
  }

  grant(
    permission: Permission | PermissionP,
    defaultPermissionManager: string,
  ): ActionFunction {
    return grant(this, permission, defaultPermissionManager);
  }

  install(identifier: string, initParams?: any[]): ActionFunction {
    return install(this, identifier, initParams);
  }

  revoke(permission: Permission, removeManager?: boolean): ActionFunction {
    return revoke(this, permission, removeManager);
  }

  upgrade(apmRepo: string, newAppAddress: string): ActionFunction {
    return upgrade(this, apmRepo, newAppAddress);
  }

  get appCache() {
    return this.#appCache;
  }

  get appArtifactCache() {
    return this.#appArtifactCache;
  }

  get connector() {
    return this._connector;
  }

  setOracle(entity: Entity): Params {
    return oracle(
      utils.isAddress(entity) ? entity : () => this.app(entity).address,
    );
  }

  resolveApp(entity: Entity): App {
    if (utils.isAddress(entity)) {
      const app = [...this.appCache.entries()].find(
        ([, app]) => app.address === entity,
      );

      if (!app) {
        throw new ErrorNotFound(`Address ${entity} doesn't match any app.`, {
          name: 'ErrorAppNotFound',
        });
      }

      return app[1];
    }
    const resolvedIdentifier = resolveIdentifier(entity);

    if (!this.appCache.has(resolvedIdentifier)) {
      throw new ErrorNotFound(`App ${resolvedIdentifier} not found.`, {
        name: 'ErrorAppNotFound',
      });
    }

    return this.appCache.get(resolvedIdentifier)!;
  }

  resolveEntity(entity: Entity): Address {
    try {
      return this.evm.resolver.resolveEntity(entity) as string;
    } catch (e) {
      return this.resolveApp(entity).address;
    }
  }

  newToken(
    name: string,
    symbol: string,
    controller: string,
    decimals?: number,
    transferable?: boolean,
  ): ActionFunction {
    return newToken(this, name, symbol, controller, decimals, transferable);
  }

  /**
   * Fetch the address of an existing or counterfactual app.
   * @param appIdentifier The [[AppIdentifier | identifier]] of the app to fetch.
   * @returns The app's contract address.
   */
  app(appIdentifier: AppIdentifier | LabeledAppIdentifier): Contract {
    const app = this.resolveApp(appIdentifier);
    return new Contract(app.address, app.abiInterface, this.evm.signer);
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
        .get(this.resolveApp(appIdentifier).codeAddress)
        ?.functions.map(({ sig }) => sig.split('(')[0])
        .filter((n) => n !== 'initialize') || []
    );
  }

  async registerNextProxyAddress(identifier: string): Promise<void> {
    const kernel = this.app('kernel');
    const nonce = await buildNonceForAddress(
      kernel.address,
      this.evm.incrementNonce(kernel.address),
      this.evm.signer.provider!,
    );

    this.evm.addressBook.set(
      identifier,
      calculateNewProxyAddress(kernel.address, nonce),
    );
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
        fetchAppArtifact(this.evm.ipfsResolver, contentUri),
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
}
