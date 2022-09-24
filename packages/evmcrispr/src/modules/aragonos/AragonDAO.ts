import type { providers } from 'ethers';
import { Contract, utils } from 'ethers';

import type { Address } from '../../types';
import type {
  App,
  AppArtifactCache,
  AppCache,
  Entity,
  ParsedApp,
} from './types';
import type { IPFSResolver } from '../../IPFSResolver';
import { calculateNewProxyAddress } from '../../utils';
import {
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  fetchAppArtifact,
  resolveIdentifier,
} from './utils';
import { AddressMap } from './AddressMap';
import type { Connector } from './Connector';

export class AragonDAO {
  #appCache: AppCache;
  #appArtifactCache: AppArtifactCache;

  #name?: string;
  #nestingIndex: number;

  #provider: providers.Provider;

  constructor(
    provider: providers.Provider,
    nestingIndex: number,
    name?: string,
  ) {
    this.#appCache = new Map();
    this.#appArtifactCache = new AddressMap();

    this.#name = name;
    this.#nestingIndex = nestingIndex;

    this.#provider = provider;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get appArtifactCache(): AppArtifactCache {
    return this.#appArtifactCache;
  }

  get kernel(): App {
    return this.resolveApp('kernel:0')!;
  }

  get name(): string | undefined {
    return this.#name;
  }

  get nestingIndex(): number {
    return this.#nestingIndex;
  }

  static async create(
    daoAddress: Address,
    provider: providers.Provider,
    connector: Connector,
    ipfsResolver: IPFSResolver,
    index: number,
    name?: string,
  ): Promise<AragonDAO> {
    const dao = new AragonDAO(provider, index, name);

    const parsedApps = await connector.organizationApps(daoAddress, provider);
    const appResourcesCache = await dao.#buildAppArtifactCache(
      parsedApps,
      ipfsResolver,
    );
    const apps = (
      await Promise.all(
        parsedApps.map((parsedApp: ParsedApp) =>
          buildApp(parsedApp, appResourcesCache),
        ),
      )
    ).filter((app: App | null) => !!app);
    const appCache = await dao.#buildAppCache(apps as App[]);

    dao.#appCache = appCache;
    dao.#appArtifactCache = appResourcesCache;

    return dao;
  }

  getAppContract(entity: Entity): Contract | undefined {
    const app = this.resolveApp(entity);

    if (!app) {
      return;
    }

    return new Contract(app.address, app.abiInterface, this.#provider);
  }

  resolveApp(entity: Entity): App | undefined {
    if (utils.isAddress(entity)) {
      const app = [...this.appCache.entries()].find(
        ([, app]) => app.address === entity,
      );

      return app ? app[1] : undefined;
    }
    const resolvedIdentifier = resolveIdentifier(entity);

    return this.appCache.get(resolvedIdentifier);
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

  async #buildAppArtifactCache(
    apps: ParsedApp[],
    ipfsResolver: IPFSResolver,
  ): Promise<AppArtifactCache> {
    const appArtifactCache: AppArtifactCache = new AddressMap();
    const artifactApps = apps.filter((app) => app.artifact);
    const artifactlessApps = apps.filter(
      (app) => !app.artifact && app.contentUri,
    );
    const contentUris = artifactlessApps.map((app) => app.contentUri);

    // Construct a contentUri => artifact map
    const uriToArtifactKeys = [...new Set<string>(contentUris)];
    const uriToArtifactValues: any[] = await Promise.all(
      uriToArtifactKeys.map((contentUri) =>
        fetchAppArtifact(ipfsResolver, contentUri),
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
}
