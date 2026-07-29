import type { BindingsManager } from "@evmcrispr/sdk";
import { abiBindingKey, BindingsSpace } from "@evmcrispr/sdk";
import { type DaoContext, resolveApp } from "../dao";
import type { AppIdentifier } from "../types";
import { extractRoleNames } from "./apps";
import { appDisplayName } from "./identifiers";

// ---------------------------------------------------------------------------
// WeakMap-backed DAO tracking for the completions / eager-execution path.
// Each BindingsManager instance (created fresh per completion request) gets
// its own DAO slot.
// ---------------------------------------------------------------------------

const completionDAOs = new WeakMap<BindingsManager, DaoContext>();
const daoCaches = new WeakMap<BindingsManager, Map<string, DaoContext>>();

/** Set the DAO for the given bindings context (last connect wins). */
export function setCompletionDAO(
  bindings: BindingsManager,
  dao: DaoContext,
): void {
  completionDAOs.set(bindings, dao);
}

/** Get the DAO for the given bindings context, if any. */
export function getCompletionDAO(
  bindings: BindingsManager,
): DaoContext | undefined {
  return completionDAOs.get(bindings);
}

/** Cache a DAO object for the given cache BindingsManager. */
export function setCachedDAO(
  cache: BindingsManager,
  key: string,
  dao: DaoContext,
): void {
  let map = daoCaches.get(cache);
  if (!map) {
    map = new Map();
    daoCaches.set(cache, map);
  }
  map.set(key, dao);
}

/** Retrieve a cached DAO object from the given cache BindingsManager. */
export function getCachedDAO(
  cache: BindingsManager,
  key: string,
): DaoContext | undefined {
  return daoCaches.get(cache)?.get(key);
}

export const getDAOAppIdentifiers = (
  bindingsManager: BindingsManager,
): string[] => {
  const dao = getCompletionDAO(bindingsManager);
  if (!dao) return [];

  return [
    ...new Set(
      dao.apps.map((app) => appDisplayName(app.name, app.registryName)),
    ),
  ];
};

export const getAppRoles = (
  bindingsManager: BindingsManager,
  appAddressOrIdentifier: AppIdentifier,
  chainId: number,
): string[] => {
  const dao = getCompletionDAO(bindingsManager);

  const appCodeAddress = dao
    ? resolveApp(dao, appAddressOrIdentifier)?.codeAddress
    : undefined;
  const appAbi = appCodeAddress
    ? bindingsManager.getBindingValue(
        abiBindingKey(chainId, appCodeAddress),
        BindingsSpace.ABI,
      )
    : undefined;

  if (!appAbi || !appCodeAddress) {
    return [];
  }

  return extractRoleNames(appAbi);
};
