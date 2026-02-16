import type { BindingsManager } from "@evmcrispr/sdk";
import { BindingsSpace } from "@evmcrispr/sdk";
import type { AragonDAO } from "../AragonDAO";
import type { AppIdentifier } from "../types";
import { extractRoleNames } from "./apps";
import {
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
} from "./identifiers";

// ---------------------------------------------------------------------------
// WeakMap-backed DAO tracking for the completions / eager-execution path.
// Each BindingsManager instance (created fresh per completion request) gets
// its own DAO stack.  This replaces the old DATA_PROVIDER binding approach.
// ---------------------------------------------------------------------------

const completionDAOStacks = new WeakMap<BindingsManager, AragonDAO[]>();
const daoCaches = new WeakMap<BindingsManager, Map<string, AragonDAO>>();

/** Push a DAO onto the completions stack for the given bindings context. */
export function pushCompletionDAO(
  bindings: BindingsManager,
  dao: AragonDAO,
): void {
  let stack = completionDAOStacks.get(bindings);
  if (!stack) {
    stack = [];
    completionDAOStacks.set(bindings, stack);
  }
  stack.push(dao);
}

/** Get all DAOs on the completions stack (most-recent first). */
export const getDAOs = (bindingsManager: BindingsManager): AragonDAO[] => {
  const stack = completionDAOStacks.get(bindingsManager);
  if (!stack || stack.length === 0) return [];
  return [...stack].reverse();
};

/** Find a specific DAO on the completions stack by name or address. */
export function findCompletionDAO(
  bindings: BindingsManager,
  identifier: string,
): AragonDAO | undefined {
  const stack = completionDAOStacks.get(bindings);
  if (!stack) return undefined;
  const lower = identifier.toLowerCase();
  for (let i = stack.length - 1; i >= 0; i--) {
    const dao = stack[i];
    if (
      dao.name === identifier ||
      dao.kernel.address.toLowerCase() === lower
    ) {
      return dao;
    }
  }
  return undefined;
}

/** Cache a DAO object for the given cache BindingsManager. */
export function setCachedDAO(
  cache: BindingsManager,
  key: string,
  dao: AragonDAO,
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
): AragonDAO | undefined {
  return daoCaches.get(cache)?.get(key);
}

export const getDAOAppIdentifiers = (
  bindingsManager: BindingsManager,
): string[] => {
  const daos = getDAOs(bindingsManager);

  return daos.flatMap((dao, i) => {
    const firstDAO = i === 0;
    return [...dao.appCache.keys()].map((appIdentifier) => {
      const formattedIdentifier = formatAppIdentifier(appIdentifier);
      return firstDAO
        ? formattedIdentifier
        : createDaoPrefixedIdentifier(
            formattedIdentifier,
            dao.name ?? dao.kernel.address,
          );
    });
  });
};

export const getAppRoles = (
  bindingsManager: BindingsManager,
  appAddressOrIdentifier: AppIdentifier,
): string[] => {
  const daos = getDAOs(bindingsManager);

  const appCodeAddress = daos
    .find((dao) => dao.resolveApp(appAddressOrIdentifier))
    ?.resolveApp(appAddressOrIdentifier)?.codeAddress;
  const appAbi = appCodeAddress
    ? bindingsManager.getBindingValue(appCodeAddress, BindingsSpace.ABI)
    : undefined;

  if (!appAbi || !appCodeAddress) {
    return [];
  }

  return extractRoleNames(appAbi);
};
