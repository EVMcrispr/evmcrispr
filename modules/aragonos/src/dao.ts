import type { Abi, Address } from "@evmcrispr/sdk";
import { AddressMap, fetchAbi } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getContractAddress, isAddress, isAddressEqual } from "viem";
import { organizationApps } from "./subgraph";
import type {
  App,
  AppResourceCache,
  Entity,
  ParsedApp,
  PermissionMap,
  Role,
} from "./types";
import {
  appDisplayName,
  buildApp,
  buildAppResource,
  normalizeRole,
} from "./utils";

export interface DaoContext {
  /** The DAO's apps in chronological installation order. */
  apps: App[];
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

function sortAppsByCreation(apps: App[]): App[] {
  const kernel = apps.find((app) => app.name.toLowerCase() === "kernel")!;
  const sortedApps = [kernel];

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
      sortedApps.push(addressToApp.get(address.toLowerCase()));
    }
  }

  return sortedApps;
}

export async function loadDao(
  daoAddress: Address,
  client: PublicClient,
  name?: string,
): Promise<DaoContext> {
  const parsedApps = await organizationApps(client, daoAddress);
  // Local dedupe of ABI fetches per implementation address; ABIs are cached
  // globally in the ABI bindings space, not on the DAO context.
  const appResourceCache = await buildAppResourceCache(parsedApps, client);
  const apps = (
    await Promise.all(
      parsedApps.map((parsedApp: ParsedApp) =>
        buildApp(parsedApp, appResourceCache),
      ),
    )
  ).filter((app: App | null) => !!app);

  return { apps: sortAppsByCreation(apps as App[]), name };
}

export function getKernel(dao: DaoContext): App {
  return resolveApp(dao, "kernel")!;
}

export function resolveApp(
  dao: DaoContext,
  entity: Entity,
  index = 0,
): App | undefined {
  if (isAddress(entity)) {
    return dao.apps.find((app) => isAddressEqual(app.address, entity));
  }

  return dao.apps.filter(
    (app) => appDisplayName(app.name, app.registryName) === entity,
  )[index];
}

/** Number of installed apps sharing the given display name. */
export function countApps(dao: DaoContext, name: string): number {
  return dao.apps.filter(
    (app) => appDisplayName(app.name, app.registryName) === name,
  ).length;
}

/**
 * The DAO's permissions indexed by a display-ready app identifier
 * (`name` for the first instance, `name <index>` for later ones).
 */
export function getPermissions(dao: DaoContext): [string, PermissionMap][] {
  const counters = new Map<string, number>();

  return dao.apps.map((app) => {
    const name = appDisplayName(app.name, app.registryName);
    const index = counters.get(name) ?? 0;
    counters.set(name, index + 1);
    return [index === 0 ? name : `${name} ${index}`, app.permissions];
  });
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
  appIdentifier: Entity,
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
    apps: structuredClone(dao.apps),
    name: dao.name,
  };
}
