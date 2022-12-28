import { BindingsSpace, ErrorInvalid } from '@1hive/evmcrispr';
import type { BindingsManager } from '@1hive/evmcrispr';
import { isAddress } from 'ethers/lib/utils';

import type { App, AppIdentifier, LabeledAppIdentifier } from '../types';

const DEFAULT_REGISTRY = 'aragonpm.eth';

export const INITIAL_APP_INDEX = ':0';

// eslint-disable-next-line
export const appIdentifierRegex =
  /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z0-9-]{1,63}))?(?::([0-9]{1,63}))?$/;
// eslint-disable-next-line
export const labeledAppIdentifierRegex =
  /^(?:_((?!-)[a-z0-9-]{1,63}(?<!-)):)?((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z0-9-]{1,63}))?(?::([a-zA-Z0-9-]{1,63}))$/;
export const optionalLabeledAppIdentifierRegex =
  /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z0-9-]{1,63}))?(?::([a-zA-Z0-9-]{1,63}))?$/;

export const parseRegistry = (registryEnsName: string): string => {
  // We denote the default aragonpm registry with an empty string
  // Assume registry is the default one if no ens name is provided.
  if (!registryEnsName) {
    return '';
  }
  const ensParts = registryEnsName.split('.');

  if (ensParts.length === 3) {
    return `.${ensParts[0]}`;
  }

  return '';
};

export const isAppIdentifier = (identifier: string): boolean => {
  return !!identifier && appIdentifierRegex.test(identifier);
};

export const isLabeledAppIdentifier = (identifier: string): boolean => {
  return !!identifier && labeledAppIdentifierRegex.test(identifier);
};

export const parseAppIdentifier = (
  appIdentifier: AppIdentifier,
): string[] | undefined => {
  return appIdentifier
    ? appIdentifierRegex.exec(appIdentifier)?.slice(1)
    : undefined;
};

export const parseLabeledIdentifier = (
  labeledAppIdentifier: LabeledAppIdentifier,
): string[] | undefined => {
  return labeledAppIdentifier
    ? labeledAppIdentifierRegex.exec(labeledAppIdentifier)?.slice(1)
    : undefined;
};

export const parseLabeledAppIdentifier = (
  labeledAppIdentifier: LabeledAppIdentifier,
): string[] => {
  if (!isLabeledAppIdentifier(labeledAppIdentifier)) {
    throw new ErrorInvalid(
      `invalid labeled identifier ${labeledAppIdentifier}`,
      {
        name: 'ErrorInvalidIdentifier',
      },
    );
  }

  const [dao, appIdentifier, registry, label] =
    parseLabeledIdentifier(labeledAppIdentifier)!;

  return [
    appIdentifier,
    registry ? `${registry}.aragonpm.eth` : DEFAULT_REGISTRY,
    label,
    dao,
  ];
};

export const formatAppIdentifier = (
  appIdentifier: LabeledAppIdentifier,
): string => {
  // Remove redundant index
  if (appIdentifier.endsWith(INITIAL_APP_INDEX)) {
    return appIdentifier.slice(0, -2);
  }

  return appIdentifier;
};

export const resolveIdentifier = (
  identifier: string,
): AppIdentifier | LabeledAppIdentifier => {
  if (isAppIdentifier(identifier)) {
    const [, , appIndex] = parseAppIdentifier(identifier)!;

    if (!appIndex) {
      return `${identifier}${INITIAL_APP_INDEX}`;
    }
    return identifier;
  }
  if (isLabeledAppIdentifier(identifier)) {
    return identifier;
  }

  throw new ErrorInvalid(`Invalid identifier ${identifier}`, {
    name: 'ErrorInvalidIdentifier',
  });
};

export const buildAppIdentifier = (
  app: App,
  appCounter: number,
): AppIdentifier => {
  const { name, registryName } = app;
  const parsedRegistryName = parseRegistry(registryName);

  if (parsedRegistryName) {
    return `${name}${parsedRegistryName}:${appCounter}`;
  } else {
    return `${name}:${appCounter}`;
  }
};

export const parsePrefixedDAOIdentifier = (
  identifier: string,
): [string | undefined, string] => {
  if (identifier.startsWith('_')) {
    const elements = identifier.split(':');
    return [elements[0].substring(1), elements[1]];
  }

  return [undefined, identifier];
};

export function getDaoAddrFromIdentifier(
  identifier: string,
  bindingsManager: BindingsManager,
): string | undefined | null {
  if (identifier.startsWith('_')) {
    const [daoPrefix] = parsePrefixedDAOIdentifier(identifier);
    if (isAddress(daoPrefix!)) {
      return daoPrefix;
    } else {
      return bindingsManager.getBindingValue(
        `_${daoPrefix}:kernel`,
        BindingsSpace.ADDR,
      );
    }
  }
}

export const createDaoPrefixedIdentifier = (
  appIdentifier: AppIdentifier | LabeledAppIdentifier,
  daoNameOrAddress: string,
): string => `_${daoNameOrAddress}:${appIdentifier}`;
