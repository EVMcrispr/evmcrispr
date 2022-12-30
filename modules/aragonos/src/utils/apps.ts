import type { Address } from '@1hive/evmcrispr';
import { utils } from 'ethers';

import { AddressSet } from '../AddressSet';
import type {
  App,
  AppArtifact,
  AppArtifactCache,
  ParsedApp,
  PermissionMap,
} from '../types';

import { parseAppArtifactName } from './parsers';

export const buildAppPermissions = (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  artifactRoles: any,
  currentPermissions: any[],
): PermissionMap => {
  const appPermissions = artifactRoles.reduce(
    (roleMap: PermissionMap, role: any) => {
      roleMap.set(role.bytes, { manager: '', grantees: new AddressSet() });
      return roleMap;
    },
    new Map(),
  );

  currentPermissions.forEach((role) => {
    appPermissions.set(role.roleHash, {
      ...appPermissions.get(role.roleHash),
      manager: role.manager,
      grantees: new AddressSet(
        role.grantees.map(
          ({ granteeAddress }: { granteeAddress: Address }) => granteeAddress,
        ),
      ),
    });
  });

  return appPermissions;
};

export const buildApp = (
  parsedApp: ParsedApp,
  appResourcesCache: AppArtifactCache,
): App | null => {
  const { address, codeAddress, contentUri, name, registryName, roles } =
    parsedApp;

  if (!appResourcesCache.has(codeAddress)) {
    return null;
  }
  const {
    abiInterface,
    appName,
    roles: artifactRoles,
  } = appResourcesCache.get(codeAddress)!;

  return {
    abiInterface,
    address,
    codeAddress,
    contentUri,
    name,
    permissions: buildAppPermissions(artifactRoles, roles),
    registryName:
      registryName && registryName.length
        ? registryName
        : parseAppArtifactName(appName),
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const buildAppArtifact = (artifact: any): AppArtifact => ({
  appName: artifact.appName as string,
  abiInterface: new utils.Interface(artifact.abi),
  roles: artifact.roles,
  functions: artifact.functions,
});

export const buildArtifactFromABI = (
  appName: string,
  appRegistry: string,
  abiInterface: utils.Interface,
): AppArtifact => {
  const roleNames = Object.values(abiInterface.functions)
    .filter((fnFragment) => fnFragment.name.endsWith('_ROLE'))
    .map((fnFragment) => fnFragment.name);

  return {
    appName: `${appName}.${appRegistry}`,
    abiInterface,
    roles: roleNames.map((name) => ({
      bytes: utils.id(name),
      id: name,
      name,
      params: [],
    })),
    functions: [],
  };
};
