import type { Action } from "@evmcrispr/sdk";
import {
  AddressSet,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { isAddress } from "viem";
import type AragonOS from "..";
import {
  type DaoContext,
  getPermissions,
  hasPermission,
  hasPermissionManager,
} from "../dao";
import { getAppRoles, getCompletionDAO, normalizeRole } from "../utils";
import {
  getDAO,
  getModuleDAO,
  isPermission,
  resolvePermissionContext,
} from "../utils/commands";

const _revoke = (dao: DaoContext, resolvedArgs: any[]): Action[] => {
  const permission = resolvedArgs.slice(0, 3);

  if (!isPermission(permission)) {
    throw new ErrorException("Invalid permission");
  }

  const [, , , removeManager] = resolvedArgs;

  const removeManagerType = typeof removeManager;
  if (removeManagerType !== "undefined" && removeManagerType !== "boolean") {
    throw new ErrorException(
      `[removeManager] must be a boolean, got ${typeof removeManager}`,
    );
  }

  const [granteeAddress, appAddress, role] = permission;

  const { appPermission, aclAddress, roleHash } = resolvePermissionContext(
    dao,
    appAddress,
    role,
  );

  if (!appPermission.grantees.has(granteeAddress.toLowerCase() as Address)) {
    throw new ErrorException(
      `grantee ${granteeAddress} doesn't have the given permission`,
    );
  }

  appPermission.grantees.delete(granteeAddress);

  const actions: Action[] = [];

  actions.push(
    encodeAction(aclAddress, "revokePermission(address,address,bytes32)", [
      granteeAddress,
      appAddress,
      roleHash,
    ]),
  );

  if (removeManager) {
    delete appPermission.manager;
    actions.push(
      encodeAction(aclAddress, "removePermissionManager(address,bytes32)", [
        appAddress,
        roleHash,
      ]),
    );
  }

  return actions;
};

export default defineCommand<AragonOS>({
  name: "revoke",
  description:
    "Revoke a permission from an entity on a DAO app, optionally removing the manager.",
  args: [
    {
      name: "grantee",
      type: "address",
      description: "Address whose permission is revoked",
    },
    { name: "app", type: "app", description: "Target app" },
    { name: "role", type: "permission", description: "Permission to revoke" },
    {
      name: "removeManager",
      type: "bool",
      description: "Also remove the permission manager",
      optional: true,
    },
  ],
  completions: {
    grantee: (ctx) => {
      const granteeAddresses = new AddressSet();
      const dao = getCompletionDAO(ctx.bindings);
      if (!dao) return [];

      getPermissions(dao).forEach(([, appPermissions]) => {
        [...appPermissions.values()].forEach((role) => {
          role.grantees.forEach(granteeAddresses.add, granteeAddresses);
        });
      });

      return [...granteeAddresses].map(fieldItem);
    },
    app: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const revokeeAddress = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const dao = getCompletionDAO(ctx.bindings);

      if (!dao || !revokeeAddress || !isAddress(revokeeAddress)) {
        return [];
      }

      const granteeApps = new Set<string>();

      getPermissions(dao).forEach(([appIdentifier, appPermissions]) => {
        [...appPermissions.values()].forEach((role) => {
          if (role.grantees.has(revokeeAddress)) {
            granteeApps.add(appIdentifier);
          }
        });
      });
      return [...granteeApps].map(fieldItem);
    },
    role: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const revokeeAddress = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const appAddress = ctx.nodeArgs[1]
        ? await ctx.resolveNode(ctx.nodeArgs[1])
        : undefined;
      const dao = getDAO(ctx.bindings);

      if (
        !revokeeAddress ||
        !isAddress(revokeeAddress) ||
        !appAddress ||
        !isAddress(appAddress)
      ) {
        return [];
      }
      return getAppRoles(ctx.bindings, appAddress, ctx.chainId)
        .filter((role) => hasPermission(dao, revokeeAddress, appAddress, role))
        .map(fieldItem);
    },
    removeManager: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const appAddress = ctx.nodeArgs[1]
        ? await ctx.resolveNode(ctx.nodeArgs[1])
        : undefined;
      const role = ctx.nodeArgs[2]
        ? await ctx.resolveNode(ctx.nodeArgs[2])
        : undefined;

      if (!role || !appAddress || !isAddress(appAddress)) {
        return [];
      }

      const roleHash = normalizeRole(role);
      const dao = getDAO(ctx.bindings);
      const hasManager = hasPermissionManager(dao, appAddress, roleHash);

      return hasManager ? [fieldItem("true")] : [];
    },
  },
  async run(module, { grantee, app, role, removeManager }) {
    const args = [grantee, app, role, removeManager];
    const dao = getModuleDAO(module);

    return _revoke(dao, args);
  },
});
