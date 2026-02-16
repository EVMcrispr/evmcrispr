import type {
  Action,
  Address,
  AddressBinding,
  NoNullableBinding,
} from "@evmcrispr/sdk";
import {
  AddressSet,
  addressesEqual,
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  interpretNodeSync,
} from "@evmcrispr/sdk";
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
  async run(module, { grantee, app, role, removeManager }) {
    const args = [grantee, app, role, removeManager];

    const appAddress = app;

    // Find the DAO that owns the app by searching all connected DAOs
    const dao = isAddress(appAddress)
      ? (module.connectedDAOs.find((d) => d.resolveApp(appAddress)) ??
        module.currentDAO)
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException('must be used within a "connect" command');
    }

    return _revoke(dao, args);
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, bindingsManager) {
    const revokeeAddress = nodeArgs[0]
      ? interpretNodeSync(nodeArgs[0], bindingsManager)
      : undefined;
    const appAddress = nodeArgs[1]
      ? interpretNodeSync(nodeArgs[1], bindingsManager)
      : undefined;
    const role = nodeArgs[2]
      ? interpretNodeSync(nodeArgs[2], bindingsManager)
      : undefined;

    switch (argIndex) {
      case 0: {
        const granteeAddresses = new AddressSet();
        const identifierBindings = bindingsManager.getAllBindings({
          spaceFilters: [BindingsSpace.ADDR],
        }) as NoNullableBinding<AddressBinding>[];
        const daosAppsPermissions = getDAOs(bindingsManager).map((dao) =>
          dao.getPermissions(),
        );

        /**
         * Get every grantee of every pemission of every app
         * on every DAO
         */
        daosAppsPermissions.forEach((daoAppsPermissions) => {
          daoAppsPermissions.forEach(([, appPermissions]) => {
            [...appPermissions.values()].forEach((role) => {
              role.grantees.forEach(granteeAddresses.add, granteeAddresses);
            });
          });
        });

        /**
         * Format grantees by replacing every address with its equivalent
         * identifier, if exists
         */
        return [...granteeAddresses].map((granteeAddress) => {
          const granteeIdentifier = identifierBindings.find(
            ({ value }) =>
              isAddress(value) && addressesEqual(value, granteeAddress),
          )?.identifier;

          return granteeIdentifier ?? granteeAddress;
        });
      }
      case 1: {
        const daosAppsPermissions = getDAOs(bindingsManager).map((dao) =>
          dao.getPermissions(),
        );

        if (!revokeeAddress || !isAddress(revokeeAddress)) {
          return [];
        }

        const granteeApps = new Set<string>();

        /**
         * Fetch grantee's permissions on every app of every DAO
         */
        daosAppsPermissions.forEach((daoAppsPermissions) => {
          daoAppsPermissions.forEach(([appIdentifier, appPermissions]) => {
            [...appPermissions.values()].forEach((role) => {
              if (role.grantees.has(revokeeAddress)) {
                granteeApps.add(formatAppIdentifier(appIdentifier));
              }
            });
          });
        });
        return [...granteeApps];
      }
      case 2: {
        const appNode = nodeArgs[1];
        const dao = getDAO(bindingsManager, appNode);

        if (
          !revokeeAddress ||
          !isAddress(revokeeAddress) ||
          !appAddress ||
          !isAddress(appAddress)
        ) {
          return [];
        }
        // Get the grantee's permissions on the given app
        return getAppRoles(bindingsManager, appAddress).filter((role) =>
          dao.hasPermission(revokeeAddress, appAddress, role),
        );
      }
      case 3: {
        if (!role || !appAddress || !isAddress(appAddress)) {
          return [];
        }

        const appNode = nodeArgs[1];
        const roleHash = normalizeRole(role);
        const dao = getDAO(bindingsManager, appNode);
        const hasManager = dao.hasPermissionManager(appAddress, roleHash);

        return hasManager ? ["true"] : [];
      }
      default:
        return [];
    }
  },
  async runEagerExecution({ args }) {
    return (eagerBindingsManager) => {
      const appNode = args[1];
      const resolvedArgs = args.map((arg) =>
        interpretNodeSync(arg, eagerBindingsManager),
      );
      const dao = getDAO(eagerBindingsManager, appNode);

      _revoke(dao, resolvedArgs);
    };
  },
});
