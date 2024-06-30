import type { AbiFunction } from "viem";

import type { BindingsManager } from "../../../BindingsManager";
import type { DataProviderBinding } from "../../../types";
import { BindingsSpace } from "../../../types";
import type { AragonDAO } from "../AragonDAO";
import type { AppIdentifier } from "../types";
import {
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
} from "./identifiers";

export const getDAOs = (bindingsManager: BindingsManager): AragonDAO[] => {
  const daos: AragonDAO[] = [];

  let currentDAOBinding = bindingsManager.getBinding(
    "currentDAO",
    BindingsSpace.DATA_PROVIDER,
  ) as DataProviderBinding<AragonDAO> | undefined;

  while (currentDAOBinding && currentDAOBinding.value) {
    daos.push(currentDAOBinding.value);
    currentDAOBinding = currentDAOBinding.parent as
      | DataProviderBinding<AragonDAO>
      | undefined;
  }

  return daos;
};

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

  // TODO: This code is repeated somewhere else
  const appRoles = appAbi
    .filter((item) => item.type === "function" && item.name.includes("_ROLE"))
    .map((item) => (item as AbiFunction).name);

  return appRoles;
};
