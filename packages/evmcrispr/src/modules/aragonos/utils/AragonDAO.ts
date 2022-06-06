import { utils } from 'ethers';

import type EVMcrispr from '../../../EVMcrispr';
import {
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  buildNonceForAddress,
  calculateNewProxyAddress,
  fetchAppArtifact,
} from '../../../utils';
import type {
  App,
  AppArtifactCache,
  AppCache,
  AppIdentifier,
  Entity,
  LabeledAppIdentifier,
  Params,
  ParsedApp,
} from '../../../types';
import Connector from './Connector';

import { oracle } from '../../..';

export class AragonDAO {
  evm: EVMcrispr;
  #installedAppCounter: number;
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
    this.evm = evm;
    this.#installedAppCounter = 0;
    this.#appCache = new Map();
    this.#appArtifactCache = new Map();
    this._connector = new Connector(chainId, {
      subgraphUrl,
    });
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

  async connect(daoAddress: string): Promise<AragonDAO> {
    const parsedApps = await this._connector.organizationApps(daoAddress);
    const appResourcesCache = await this.#buildAppArtifactCache(parsedApps);
    const apps = parsedApps
      .map((parsedApp: ParsedApp) => buildApp(parsedApp, appResourcesCache))
      .filter((app: App | null) => !!app);
    const appCache = await this.#buildAppCache(apps as App[]);

    this.#appCache = appCache;
    this.#appArtifactCache = appResourcesCache;
    return this;
  }

  setOracle(entity: Entity): Params {
    return oracle(
      utils.isAddress(entity)
        ? entity
        : () => this.evm.resolver.resolveApp(entity).address,
    );
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
        .get(this.evm.resolver.resolveApp(appIdentifier).codeAddress)
        ?.functions.map(({ sig }) => sig.split('(')[0])
        .filter((n) => n !== 'initialize') || []
    );
  }

  async registerNextProxyAddress(identifier: string): Promise<void> {
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
