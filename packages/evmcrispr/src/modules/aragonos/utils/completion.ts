import type { BindingsManager } from '../../../BindingsManager';
import type { DataProviderBinding } from '../../../types';
import { BindingsSpace } from '../../../types';
import type { AragonDAO } from '../AragonDAO';
import { DATA_PROVIDER_TYPE } from '../AragonDAO';
import { createDaoPrefixedIdentifier } from './identifiers';

export const getDAOAppIdentifiers = (
  bindingsManager: BindingsManager,
): string[] => {
  const dataProviders = bindingsManager.getAllBindingValues({
    spaceFilters: [BindingsSpace.DATA_PROVIDER],
  }) as DataProviderBinding['value'][];
  const daos = dataProviders.filter<AragonDAO>(
    (dataProvider): dataProvider is AragonDAO =>
      dataProvider.type === DATA_PROVIDER_TYPE,
  );

  return daos.flatMap((dao, i) => {
    const firstDAO = i === daos.length - 1;
    return [...dao.appCache.keys()].map((appIdentifier) => {
      const formattedIdentifier = appIdentifier.endsWith(':1')
        ? appIdentifier.slice(0, -2)
        : appIdentifier;
      return firstDAO
        ? formattedIdentifier
        : createDaoPrefixedIdentifier(
            formattedIdentifier,
            dao.name ?? dao.kernel.address,
          );
    });
  });
};
