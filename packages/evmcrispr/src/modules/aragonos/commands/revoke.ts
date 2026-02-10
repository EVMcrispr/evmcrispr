import { isAddress } from "viem";

import { ErrorException } from "../../../errors";
import type {
  Action,
  Address,
  AddressBinding,
  InterpretOptions,
  NoNullableBinding,
} from "../../../types";
import { BindingsSpace } from "../../../types";
import {
  addressesEqual,
  defineCommand,
  encodeAction,
  interpretNodeSync,
} from "../../../utils";
import { AddressSet } from "../AddressSet";
import type { AragonDAO } from "../AragonDAO";
import type { AragonOS } from "../AragonOS";
import {
  formatAppIdentifier,
  getAppRoles,
  getDAOs,
  normalizeRole,
} from "../utils";
import { getDAO, isPermission } from "../utils/commands";

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

  const roleHash = normalizeRole(role);
  const app = dao.resolveApp(appAddress);

  if (!app) {
    throw new ErrorException(`${appAddress} is not a DAO's app`);
  }

  const { permissions: appPermissions, name } = app;
  const { address: aclAddress } = dao!.resolveApp("acl")!;

  if (!appPermissions.has(roleHash)) {
    throw new ErrorException(`given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;
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

export const revoke = defineCommand<AragonOS>({
  args: [
    { name: "grantee", type: "any", skipInterpret: true },
    { name: "app", type: "any", skipInterpret: true },
    { name: "role", type: "any", skipInterpret: true },
    { name: "removeManager", type: "any", optional: true, skipInterpret: true },
  ],
  async run(module, _args, { node, interpreters }) {
    const { interpretNode } = interpreters;

    const dao = getDAO(module.bindingsManager, node.args[1]);

    const args = await Promise.all(
      node.args.map((arg, i) => {
        const opts: Partial<InterpretOptions> | undefined =
          i < 2 ? { allowNotFoundError: true } : undefined;
        return interpretNode(arg, opts);
      }),
    );

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
