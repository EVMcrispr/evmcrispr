import type { Signer } from 'ethers';
import { utils } from 'ethers';

import type { Address, App, AppCache, Entity, ParsedApp } from '../../..';
import { ErrorNotFound } from '../../../errors';
import type { IPFSResolver } from '../../../IPFSResolver';
import Connector from '../../../modules/aragonos/utils/Connector';
import type { AppArtifactCache } from '../../../types';
import {
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  calculateNewProxyAddress,
  fetchAppArtifact,
  resolveIdentifier,
} from '../../../utils';

export class AragonDAO {
  #appCache: AppCache;
  #appArtifactCache: AppArtifactCache;
  #connector: Connector;
  #ipfsResolver: IPFSResolver;

  constructor(
    chainId: number,
    subgraphUrl: string,
    ipfsResolver: IPFSResolver,
  ) {
    this.#appCache = new Map();
    this.#appArtifactCache = new Map();
    this.#connector = new Connector(chainId, { subgraphUrl });
    this.#ipfsResolver = ipfsResolver;
  }

  get connector(): Connector {
    return this.#connector;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get appArtifactCache(): AppArtifactCache {
    return this.#appArtifactCache;
  }

  static async create(
    daoAddress: Address,
    subgraphUrl: string,
    signer: Signer,
    ipfsResolver: IPFSResolver,
  ): Promise<AragonDAO> {
    const dao = new AragonDAO(
      await signer.getChainId(),
      subgraphUrl,
      ipfsResolver,
    );

    const parsedApps = await dao.connector.organizationApps(daoAddress);
    const appResourcesCache = await dao.#buildAppArtifactCache(parsedApps);
    const apps = parsedApps
      .map((parsedApp: ParsedApp) => buildApp(parsedApp, appResourcesCache))
      .filter((app: App | null) => !!app);
    const appCache = await dao.#buildAppCache(apps as App[]);

    dao.#appCache = appCache;
    dao.#appArtifactCache = appResourcesCache;
    return dao;
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
        fetchAppArtifact(this.#ipfsResolver, contentUri),
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
