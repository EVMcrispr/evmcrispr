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
import type { AragonDAO } from "../AragonDAO";
import {
  formatAppIdentifier,
  getAppRoles,
  getDAOs,
  normalizeRole,
} from "../utils";
import {
  getDAO,
  isPermission,
  resolvePermissionContext,
} from "../utils/commands";

const _revoke = (dao: AragonDAO, resolvedArgs: any[]): Action[] => {
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
  args: [
    { name: "grantee", type: "address" },
    { name: "app", type: "app" },
    { name: "role", type: "permission" },
    { name: "removeManager", type: "bool", optional: true },
  ],
  completions: {
    grantee: (ctx) => {
      const granteeAddresses = new AddressSet();
      const daosAppsPermissions = getDAOs(ctx.bindings).map((dao) =>
        dao.getPermissions(),
      );

      daosAppsPermissions.forEach((daoAppsPermissions) => {
        daoAppsPermissions.forEach(([, appPermissions]) => {
          [...appPermissions.values()].forEach((role) => {
            role.grantees.forEach(granteeAddresses.add, granteeAddresses);
          });
        });
      });

      return [...granteeAddresses].map(fieldItem);
    },
    app: async (ctx) => {
      if (!ctx.resolveNode) return [];
      const revokeeAddress = ctx.nodeArgs[0]
        ? await ctx.resolveNode(ctx.nodeArgs[0])
        : undefined;
      const daosAppsPermissions = getDAOs(ctx.bindings).map((dao) =>
        dao.getPermissions(),
      );

      if (!revokeeAddress || !isAddress(revokeeAddress)) {
        return [];
      }

      const granteeApps = new Set<string>();

      daosAppsPermissions.forEach((daoAppsPermissions) => {
        daoAppsPermissions.forEach(([appIdentifier, appPermissions]) => {
          [...appPermissions.values()].forEach((role) => {
            if (role.grantees.has(revokeeAddress)) {
              granteeApps.add(formatAppIdentifier(appIdentifier));
            }
          });
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
      const appNode = ctx.nodeArgs[1];
      const dao = getDAO(ctx.bindings, appNode);

      if (
        !revokeeAddress ||
        !isAddress(revokeeAddress) ||
        !appAddress ||
        !isAddress(appAddress)
      ) {
        return [];
      }
      return getAppRoles(ctx.bindings, appAddress, ctx.chainId)
        .filter((role) => dao.hasPermission(revokeeAddress, appAddress, role))
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

      const appNode = ctx.nodeArgs[1];
      const roleHash = normalizeRole(role);
      const dao = getDAO(ctx.bindings, appNode);
      const hasManager = dao.hasPermissionManager(appAddress, roleHash);

      return hasManager ? [fieldItem("true")] : [];
    },
  },
  async run(module, { grantee, app, role, removeManager }) {
    const args = [grantee, app, role, removeManager];

    const appAddress = app;

    const dao = isAddress(appAddress)
      ? (module.connectedDAOs.find((d) => d.resolveApp(appAddress)) ??
        module.currentDAO)
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException('must be used within a "connect" command');
    }

    return _revoke(dao, args);
  },
});
