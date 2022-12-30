import { BindingsSpace } from '@1hive/evmcrispr';
import type { BindingsManager, DataProviderBinding } from '@1hive/evmcrispr';

import type { AragonDAO } from '../AragonDAO';
import type { AppIdentifier } from '../types';
import {
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
} from './identifiers';

export const getDAOs = (bindingsManager: BindingsManager): AragonDAO[] => {
  const daos: AragonDAO[] = [];

  let currentDAOBinding = bindingsManager.getBinding(
    'currentDAO',
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
  const appAbiInterface = appCodeAddress
    ? bindingsManager.getBindingValue(appCodeAddress, BindingsSpace.ABI)
    : undefined;

  if (!appAbiInterface || !appCodeAddress) {
    return [];
  }

  const appRoles = Object.values(appAbiInterface.functions)
    .filter((fnFragment) => fnFragment.name.includes('_ROLE'))
    .map((fnFragment) => fnFragment.name);

  return appRoles;
};
