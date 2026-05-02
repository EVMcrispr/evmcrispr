import type { Abi, Address } from "@evmcrispr/sdk";
import { AddressMap, fetchAbi } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getContractAddress, isAddress } from "viem";
import { organizationApps } from "./subgraph";
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

export interface DaoContext {
  appCache: AppCache;
  appResourceCache: AppResourceCache;
  nestingIndex: number;
  name?: string;
}

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

export async function loadDao(
  daoAddress: Address,
  client: PublicClient,
  nestingIndex: number,
  name?: string,
): Promise<DaoContext> {
  const parsedApps = await organizationApps(client, daoAddress);
  const appResourceCache = await buildAppResourceCache(parsedApps, client);
  const apps = (
    await Promise.all(
      parsedApps.map((parsedApp: ParsedApp) =>
        buildApp(parsedApp, appResourceCache),
      ),
    )
  ).filter((app: App | null) => !!app);
  const appCache = await buildAppCache(apps as App[]);

  return { appCache, appResourceCache, nestingIndex, name };
}

export function getKernel(dao: DaoContext): App {
  return resolveApp(dao, `kernel${INITIAL_APP_INDEX}`)!;
}

export function resolveApp(dao: DaoContext, entity: Entity): App | undefined {
  if (isAddress(entity)) {
    const app = [...dao.appCache.entries()].find(
      ([, app]) => app.address === entity,
    );

    return app ? app[1] : undefined;
  }
  const resolvedIdentifier = resolveIdentifier(entity);

  return dao.appCache.get(resolvedIdentifier);
}

export function getPermissions(dao: DaoContext): [string, PermissionMap][] {
  return [...dao.appCache.entries()].map(([appName, app]) => [
    appName,
    app.permissions,
  ]);
}

export function getPermission(
  dao: DaoContext,
  entity: Entity,
  roleNameOrHash: string,
): Role | undefined {
  const roleHash = normalizeRole(roleNameOrHash);
  const app = resolveApp(dao, entity);

  if (!app || !app.permissions.has(roleHash)) {
    return;
  }

  return app.permissions.get(roleHash)!;
}

export function hasPermission(
  dao: DaoContext,
  entity: Address,
  appIdentifier: LabeledAppIdentifier,
  roleNameOrHash: string,
): boolean {
  const role = getPermission(dao, appIdentifier, roleNameOrHash);

  return !!role && role.grantees.has(entity);
}

export function hasPermissionManager(
  dao: DaoContext,
  entity: Entity,
  roleNameOrHash: string,
): boolean {
  const role = getPermission(dao, entity, roleNameOrHash);

  if (!role) {
    return false;
  }

  return !!role.manager;
}

export function getPermissionManager(
  dao: DaoContext,
  entity: Entity,
  roleNameOrHash: string,
): Address | undefined {
  const role = getPermission(dao, entity, roleNameOrHash);

  if (!role) {
    return;
  }

  return role.manager;
}

export function cloneDao(dao: DaoContext): DaoContext {
  return {
    appCache: structuredClone(dao.appCache),
    appResourceCache: dao.appResourceCache,
    nestingIndex: dao.nestingIndex,
    name: dao.name,
  };
}
