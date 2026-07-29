import type { Address, BindingsManager } from "@evmcrispr/sdk";
import { ErrorException, listItems } from "@evmcrispr/sdk";
import { isAddress } from "viem";
import type AragonOS from "..";
import { type DaoContext, resolveApp } from "../dao";
import type { App, CompletePermission, PermissionMap, Role } from "../types";
import { getCompletionDAO } from "./completion";
import { normalizeRole } from "./normalizers";

// --- Runtime path: uses module instance ---

/**
 * Get DAO from the module's current connect block. Used by runtime (run) functions.
 */
export const getModuleDAO = (module: AragonOS): DaoContext => {
  const dao = module.currentDAO;
  if (!dao) {
    throw new ErrorException('must be used within a "connect" command');
  }
  return dao;
};

// --- Completions / eager execution path: uses WeakMap-backed DAO slot ---

export const getDAO = (bindingsManager: BindingsManager): DaoContext => {
  const dao = getCompletionDAO(bindingsManager);

  if (!dao) {
    throw new ErrorException('must be used within a "connect" command');
  }

  return dao;
};

export interface PermissionContext {
  app: App;
  roleHash: string;
  appPermissions: PermissionMap;
  appPermission: Role;
  aclAddress: Address;
}

/**
 * Resolves and validates a permission's context from the DAO.
 * Shared between grant and revoke commands.
 */
export const resolvePermissionContext = (
  dao: DaoContext,
  appAddress: Address,
  role: string,
): PermissionContext => {
  const app = resolveApp(dao, appAddress);

  if (!app) {
    throw new ErrorException(`${appAddress} is not a DAO's app`);
  }

  const roleHash = normalizeRole(role);
  const { permissions: appPermissions, name } = app;
  const { address: aclAddress } = resolveApp(dao, "acl")!;

  if (!appPermissions.has(roleHash)) {
    throw new ErrorException(`given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;

  return { app, roleHash, appPermissions, appPermission, aclAddress };
};

export const isPermission = (p: any[]): p is CompletePermission | never => {
  const errors: string[] = [];
  const [granteeAddress, appAddress, role, managerAddress] = p;

  if (!isAddress(granteeAddress)) {
    errors.push(`<grantee> must be a valid address, got ${granteeAddress}`);
  }

  if (!isAddress(appAddress)) {
    errors.push(`<app> must be a valid address, got ${appAddress}`);
  }

  if (role.startsWith("0x")) {
    if (role.length !== 66) {
      errors.push(`<role> must be a valid hash, got ${role}`);
    }
  }

  if (managerAddress && !isAddress(managerAddress)) {
    errors.push(
      `<permissionManager> must be a valid address, got ${managerAddress}`,
    );
  }

  if (errors.length) {
    throw new ErrorException(listItems("invalid permission provided", errors));
  }

  return true;
};
