import type { Address, IDataProvider, IPFSResolver } from '@1hive/evmcrispr';
import { calculateNewProxyAddress } from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { Contract, utils } from 'ethers';
import cloneDeep from 'lodash.clonedeep';

import { AddressMap } from './AddressMap';
import { Connector } from './Connector';
import type {
  App,
  AppArtifactCache,
  AppCache,
  Entity,
  LabeledAppIdentifier,
  ParsedApp,
  PermissionMap,
  Role,
} from './types';

import {
  INITIAL_APP_INDEX,
  buildApp,
  buildAppArtifact,
  buildAppIdentifier,
  fetchAppArtifact,
  normalizeRole,
  resolveIdentifier,
} from './utils';

export const DATA_PROVIDER_TYPE = 'ARAGONOS_DAO';

export const isAragonDAO = (
  dataProvider: IDataProvider,
): dataProvider is AragonDAO => dataProvider.type === DATA_PROVIDER_TYPE;

async function buildAppArtifactCache(
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

async function buildAppCache(apps: App[]): Promise<AppCache> {
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
    const address = calculateNewProxyAddress(kernel.address, utils.hexlify(i));

    if (addressToApp.has(address)) {
      sortedParsedApps.push(addressToApp.get(address));
    }
  }

  // Create app cache
  for (const app of sortedParsedApps) {
    const { name } = app;
    const counter = appCounter.has(name)
      ? appCounter.get(name)
      : Number(INITIAL_APP_INDEX[1]);
    const appIdentifier = buildAppIdentifier(app, counter);

    appCache.set(appIdentifier, app);
    appCounter.set(name, counter + 1);
  }

  return appCache;
}

export class AragonDAO implements IDataProvider {
  type: string;
  #appCache: AppCache;
  #appArtifactCache: AppArtifactCache;
  #name?: string;
  #nestingIndex: number;

  constructor(
    appCache: AppCache,
    appArtifactCache: AppArtifactCache,
    nestingIndex: number,
    name?: string,
  ) {
    this.type = DATA_PROVIDER_TYPE;
    this.#appCache = appCache;
    this.#appArtifactCache = appArtifactCache;
    this.#name = name;
    this.#nestingIndex = nestingIndex;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get appArtifactCache(): AppArtifactCache {
    return this.#appArtifactCache;
  }

  get kernel(): App {
    return this.resolveApp(`kernel${INITIAL_APP_INDEX}`)!;
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
    ipfsResolver: IPFSResolver,
    index: number,
    name?: string,
  ): Promise<AragonDAO> {
    const connector = new Connector(
      (await provider.getNetwork()).chainId,
      provider,
    );
    const parsedApps = await connector.organizationApps(daoAddress);
    const appResourcesCache = await buildAppArtifactCache(
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
    const appCache = await buildAppCache(apps as App[]);

    return new AragonDAO(appCache, appResourcesCache, index, name);
  }

  getAppContract(
    entity: Entity,
    provider: providers.Provider,
  ): Contract | undefined {
    const app = this.resolveApp(entity);

    if (!app) {
      return;
    }

    return new Contract(app.address, app.abiInterface, provider);
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

  getPermissions(): [string, PermissionMap][] {
    return [...this.appCache.entries()].map(([appName, app]) => [
      appName,
      app.permissions,
    ]);
  }

  getPermission(entity: Entity, roleNameOrHash: string): Role | undefined {
    const roleHash = normalizeRole(roleNameOrHash);
    const app = this.resolveApp(entity);

    if (!app || !app.permissions.has(roleHash)) {
      return;
    }

    return app.permissions.get(roleHash)!;
  }

  hasPermission(
    entity: Address,
    appIdentifier: LabeledAppIdentifier,
    roleNameOrHash: string,
  ): boolean {
    const role = this.getPermission(appIdentifier, roleNameOrHash);

    return !!role && role.grantees.has(entity);
  }

  hasPermissionManager(entity: Entity, roleNameOrHash: string): boolean {
    const role = this.getPermission(entity, roleNameOrHash);

    if (!role) {
      return false;
    }

    return !!role.manager;
  }

  getPermissionManager(
    entity: Entity,
    roleNameOrHash: string,
  ): Address | undefined {
    const role = this.getPermission(entity, roleNameOrHash);

    if (!role) {
      return;
    }

    return role.manager;
  }

  clone(): AragonDAO {
    const clonedAppCache = cloneDeep(this.#appCache);

    return new AragonDAO(
      clonedAppCache,
      this.#appArtifactCache,
      this.#nestingIndex,
      this.#name,
    );
  }
}
