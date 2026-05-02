import type { Abi, Address } from "@evmcrispr/sdk";
import { AddressSet } from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { keccak256, toFunctionSignature, toHex } from "viem";
import type {
  App,
  AppResource,
  AppResourceCache,
  ParsedApp,
  PermissionMap,
} from "../types";

export const extractRoleNames = (abi: Abi): string[] =>
  abi
    .filter(
      (item): item is AbiFunction =>
        item.type === "function" && item.name.endsWith("_ROLE"),
    )
    .map((item) => item.name);

export const buildAppPermissions = (
  appRoles: AppResource["roles"],
  currentPermissions: ParsedApp["roles"],
): PermissionMap => {
  const appPermissions = appRoles.reduce((roleMap: PermissionMap, role) => {
    roleMap.set(role.bytes, {
      manager: undefined,
      grantees: new AddressSet(),
    });
    return roleMap;
  }, new Map());

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
  appResourcesCache: AppResourceCache,
): App | null => {
  const { address, codeAddress, contentUri, name, registryName, roles } =
    parsedApp;

  if (!appResourcesCache.has(codeAddress)) {
    return null;
  }
  const { abi, appName, roles: appRoles } = appResourcesCache.get(codeAddress)!;

  return {
    abi,
    address,
    codeAddress,
    contentUri: contentUri ?? "",
    name,
    permissions: buildAppPermissions(appRoles, roles),
    registryName: registryName?.length
      ? registryName
      : (appName.split(/\.(.+)/)[1] ?? ""),
  };
};

export const buildAppResource = (
  appName: string,
  appRegistry: string,
  abi: Abi,
): AppResource => {
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
    functions: abi
      .filter((item): item is AbiFunction => item.type === "function")
      .map((item) => ({ sig: toFunctionSignature(item) })),
  };
};
