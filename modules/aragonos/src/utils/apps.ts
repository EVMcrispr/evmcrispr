import type { Abi, Address } from "@evmcrispr/sdk";
import { AddressSet } from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { keccak256, toHex } from "viem";
import type {
  App,
  AppArtifact,
  AppArtifactCache,
  ParsedApp,
  PermissionMap,
} from "../types";

import { parseAppArtifactName } from "./parsers";

export const extractRoleNames = (abi: Abi): string[] =>
  abi
    .filter(
      (item): item is AbiFunction =>
        item.type === "function" && item.name.endsWith("_ROLE"),
    )
    .map((item) => item.name);

export const buildAppPermissions = (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  artifactRoles: any,
  currentPermissions: any[],
): PermissionMap => {
  const appPermissions = artifactRoles.reduce(
    (roleMap: PermissionMap, role: any) => {
      roleMap.set(role.bytes, {
        manager: undefined,
        grantees: new AddressSet(),
      });
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
    abi,
    appName,
    roles: artifactRoles,
  } = appResourcesCache.get(codeAddress)!;

  return {
    abi,
    address,
    codeAddress,
    contentUri,
    name,
    permissions: buildAppPermissions(artifactRoles, roles),
    registryName: registryName?.length
      ? registryName
      : parseAppArtifactName(appName),
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const buildAppArtifact = (artifact: any): AppArtifact => ({
  appName: artifact.appName as string,
  abi: artifact.abi,
  roles: artifact.roles,
  functions: artifact.functions,
});

export const buildArtifactFromABI = (
  appName: string,
  appRegistry: string,
  abi: Abi,
): AppArtifact => {
  const roleNames = extractRoleNames(abi);
  return {
    appName: `${appName}.${appRegistry}`,
    abi,
    roles: roleNames.map((name) => ({
      bytes: keccak256(toHex(name)),
      id: name,
      name,
      params: [],
    })),
    functions: [],
  };
};
