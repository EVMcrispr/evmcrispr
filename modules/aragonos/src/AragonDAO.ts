import type { Abi, Address } from "@evmcrispr/sdk";
import { AddressMap, fetchAbi } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getContractAddress, isAddress } from "viem";
import { Connector } from "./Connector";
import type {
  App,
  AppCache,
  AppResourceCache,
  Entity,
  LabeledAppIdentifier,
  ParsedApp,
  PermissionMap,
  Role,
} from "./types";
import {
  buildApp,
  buildAppIdentifier,
  buildAppResource,
  INITIAL_APP_INDEX,
  normalizeRole,
  resolveIdentifier,
} from "./utils";

async function buildAppResourceCache(
  apps: ParsedApp[],
  client: PublicClient,
): Promise<AppResourceCache> {
  const appResourceCache: AppResourceCache = new AddressMap();
  const appsByCodeAddress = new AddressMap<ParsedApp>();

  apps.forEach((app) => {
    if (!appsByCodeAddress.has(app.codeAddress)) {
      appsByCodeAddress.set(app.codeAddress, app);
    }
  });

  await Promise.all(
    [...appsByCodeAddress.values()].map(async (app) => {
      let abi: Abi = [];
      try {
        [, abi] = await fetchAbi(app.codeAddress, client);
      } catch {
        // Keep the app resolvable even when the ABI API has no metadata.
      }

      appResourceCache.set(
        app.codeAddress,
        buildAppResource(app.name, app.registryName ?? "aragonpm.eth", abi),
      );
    }),
  );

  return appResourceCache;
}

async function buildAppCache(apps: App[]): Promise<AppCache> {
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
    const address = getContractAddress({
      from: kernel.address,
      nonce: BigInt(i),
    });

    if (addressToApp.has(address.toLowerCase())) {
      sortedParsedApps.push(addressToApp.get(address.toLowerCase()));
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

export class AragonDAO {
  #appCache: AppCache;
  #appResourceCache: AppResourceCache;
  #name?: string;
  #nestingIndex: number;

  constructor(
    appCache: AppCache,
    appResourceCache: AppResourceCache,
    nestingIndex: number,
    name?: string,
  ) {
    this.#appCache = appCache;
    this.#appResourceCache = appResourceCache;
    this.#name = name;
    this.#nestingIndex = nestingIndex;
  }

  get appCache(): AppCache {
    return this.#appCache;
  }

  get appResourceCache(): AppResourceCache {
    return this.#appResourceCache;
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
    client: PublicClient,
    index: number,
    name?: string,
  ): Promise<AragonDAO> {
    const connector = new Connector(await client.getChainId(), client);
    const parsedApps = await connector.organizationApps(daoAddress);
    const appResourcesCache = await buildAppResourceCache(parsedApps, client);
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

  resolveApp(entity: Entity): App | undefined {
    if (isAddress(entity)) {
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
    const clonedAppCache = structuredClone(this.#appCache);

    return new AragonDAO(
      clonedAppCache,
      this.#appResourceCache,
      this.#nestingIndex,
      this.#name,
    );
  }
}
