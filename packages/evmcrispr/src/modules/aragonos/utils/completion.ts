import { utils } from 'ethers';

import type { BindingsManager } from '../../../BindingsManager';
import type { DataProviderBinding } from '../../../types';
import { BindingsSpace } from '../../../types';
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

  while (currentDAOBinding) {
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
  const appAddress = utils.isAddress(appAddressOrIdentifier)
    ? appAddressOrIdentifier
    : bindingsManager.getBindingValue(
        appAddressOrIdentifier,
        BindingsSpace.ADDR,
      );
  const daos = getDAOs(bindingsManager);
  const isDAOApp =
    !!appAddress && !!daos.find((dao) => dao.resolveApp(appAddress));
  const appAbiInterface = appAddress
    ? bindingsManager.getBindingValue(appAddress, BindingsSpace.ABI)
    : undefined;

  if (!appAbiInterface || !isDAOApp) {
    return [];
  }

  const appRoles = Object.keys(appAbiInterface.functions)
    .filter((fnName) => fnName.includes('_ROLE()'))
    // Get rid of fn parenthesis
    .map((fnName) => fnName.slice(0, -2));

  return appRoles;
};
