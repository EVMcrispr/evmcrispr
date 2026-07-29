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
  hasPermissionManager,
  resolveApp,
} from "../dao";
import { getAppRoles, getCompletionDAO, normalizeRole } from "../utils";
import {
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
    { name: "role", type: "permission", description: "Permission to revoke" },
    { name: "on", type: "command", description: "Keyword `on`" },
    { name: "app", type: "app", description: "Target app" },
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "grantee",
      type: "address",
      description: "Address whose permission is revoked",
    },
    {
      name: "removeManager",
      type: "bool",
      description: "Also remove the permission manager",
      optional: true,
    },
  ],
  completions: {
    role: (ctx) => {
      const dao = getCompletionDAO(ctx.bindings);
      if (!dao) return [];
      const grantedRoles = new Set<string>();
      for (const app of dao.apps) {
        for (const role of getAppRoles(
          ctx.bindings,
          app.address,
          ctx.chainId,
        )) {
          if (app.permissions.get(normalizeRole(role))?.grantees.size) {
            grantedRoles.add(role);
          }
        }
      }
      return [...grantedRoles].map(fieldItem);
    },
    on: () => [fieldItem("on")],
    app: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const role = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const dao = getCompletionDAO(ctx.bindings);
      if (!dao || !role) return [];

      const roleHash = normalizeRole(role);
      return getPermissions(dao)
        .filter(
          ([, appPermissions]) => appPermissions.get(roleHash)?.grantees.size,
        )
        .map(([appIdentifier]) => fieldItem(appIdentifier));
    },
    from: () => [fieldItem("from")],
    grantee: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const role = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const appAddress = ctx.nodeArgs[2]
        ? await ctx.resolveNode(ctx.nodeArgs[2])
        : undefined;
      const dao = getCompletionDAO(ctx.bindings);
      if (!dao || !role) return [];

      const granteeAddresses = new AddressSet();
      const roleHash = normalizeRole(role);
      const apps =
        appAddress && isAddress(appAddress)
          ? [resolveApp(dao, appAddress)].filter(
              (app): app is NonNullable<typeof app> => app !== undefined,
            )
          : dao.apps;
      apps.forEach((app) => {
        app.permissions
          .get(roleHash)
          ?.grantees.forEach(granteeAddresses.add, granteeAddresses);
      });
      return [...granteeAddresses].map(fieldItem);
    },
    removeManager: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const role = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const appAddress = ctx.nodeArgs[2]
        ? await ctx.resolveNode(ctx.nodeArgs[2])
        : undefined;
      const dao = getCompletionDAO(ctx.bindings);

      if (!dao || !role || !appAddress || !isAddress(appAddress)) {
        return [];
      }

      const roleHash = normalizeRole(role);
      const hasManager = hasPermissionManager(dao, appAddress, roleHash);

      return hasManager ? [fieldItem("true")] : [];
    },
  },
  async run(module, { role, on, app, from, grantee, removeManager }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    const args = [grantee, app, role, removeManager];
    const dao = getModuleDAO(module);

    return _revoke(dao, args);
  },
});
