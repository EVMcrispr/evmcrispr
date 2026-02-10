import type { Action, InterpretOptions } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  interpretNodeSync,
} from "@evmcrispr/sdk";
import { isAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import { AddressSet } from "../AddressSet";
import type { AragonDAO } from "../AragonDAO";
import type { CompletePermission, Params } from "../types";
import {
  getAppRoles,
  getDAOAppIdentifiers,
  normalizeRole,
  oracle,
} from "../utils";
import { getDAO, isPermission } from "../utils/commands";

const _grant = (dao: AragonDAO, permission: CompletePermission): Action[] => {
  const [granteeAddress, appAddress, role, permissionManager, params = []] =
    permission;

  const roleHash = normalizeRole(role);

  const app = dao.resolveApp(appAddress);

  if (!app) {
    throw new ErrorException(`${appAddress} is not a DAO's app`);
  }

  const { permissions: appPermissions, name } = app;
  const { address: aclAddress } = dao!.resolveApp("acl")!;
  const actions: Action[] = [];

  if (!appPermissions.has(roleHash)) {
    // TODO: get app identifier. Maybe set it on cache
    throw new ErrorException(`given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;

  // If the permission already existed and no parameters are needed, just grant to a new entity and exit
  if (
    appPermission.manager &&
    appPermission.manager !== zeroAddress &&
    params.length === 0
  ) {
    if (appPermission.grantees.has(granteeAddress)) {
      // TODO: get app identifier. Maybe set it on cache
      throw new ErrorException(
        `grantee already has given permission on app ${name}`,
      );
    }
    appPermission.grantees.add(granteeAddress);

    return [
      encodeAction(aclAddress, "grantPermission(address,address,bytes32)", [
        granteeAddress,
        appAddress,
        roleHash,
      ]),
    ];
  }

  // If the permission does not exist previously, create it
  if (!appPermission.manager || appPermission.manager === zeroAddress) {
    if (!permissionManager) {
      throw new ErrorException("required permission manager missing");
    }

    if (!isAddress(permissionManager)) {
      throw new ErrorException(
        `[permissionManager] must be a valid address, got ${permissionManager}`,
      );
    }
    appPermissions.set(roleHash, {
      manager: permissionManager,
      grantees: new AddressSet([granteeAddress]),
    });

    actions.push(
      encodeAction(
        aclAddress,
        "createPermission(address,address,bytes32,address)",
        [granteeAddress, appAddress, roleHash, permissionManager],
      ),
    );
  }

  // If we need to set up parameters we call the grantPermissionP function, even if we just created the permission
  if (params.length > 0) {
    if (appPermission.grantees.has(granteeAddress)) {
      throw new ErrorException(
        `grantee ${granteeAddress} already has given permission on app ${name}`,
      );
    }
    appPermission.grantees.add(granteeAddress);

    actions.push(
      encodeAction(
        aclAddress,
        "grantPermissionP(address,address,bytes32,uint256[])",
        [granteeAddress, appAddress, roleHash, params],
      ),
    );
  }

  return actions;
};

export default defineCommand<AragonOS>({
  name: "grant",
  args: [
    { name: "grantee", type: "any", skipInterpret: true },
    { name: "app", type: "any", skipInterpret: true },
    { name: "role", type: "any", skipInterpret: true },
    {
      name: "permissionManager",
      type: "any",
      optional: true,
      skipInterpret: true,
    },
  ],
  opts: [{ name: "oracle", type: "address" }],
  async run({ bindingsManager }, _args, { opts, node, interpreters }) {
    const { interpretNode } = interpreters;

    const dao = getDAO(bindingsManager, node.args[1]);

    const permissionMangerArgNode = node.args[3];
    const permissionManager = permissionMangerArgNode
      ? await interpretNode(permissionMangerArgNode, {
          allowNotFoundError: true,
        })
      : undefined;
    const [grantee, app, role] = await Promise.all(
      node.args.slice(0, 3).map((arg, i) => {
        const opts: Partial<InterpretOptions> | undefined =
          i !== 2 ? { allowNotFoundError: true } : undefined;

        return interpretNode(arg, opts);
      }),
    );
    const oracleOpt = opts.oracle;

    let params: ReturnType<Params> = [];

    if (oracleOpt) {
      params = oracle(oracleOpt)();
    }

    const permission: any[] = [grantee, app, role, permissionManager, params];

    if (!isPermission(permission)) {
      throw new ErrorException("Invalid permission");
    }

    return _grant(dao, permission);
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, bindingsManager) {
    switch (argIndex) {
      case 0:
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [BindingsSpace.ADDR],
        });
      case 1:
        return getDAOAppIdentifiers(bindingsManager);
      case 2: {
        const appNode = nodeArgs[1];
        const grantee = interpretNodeSync(nodeArgs[0], bindingsManager);
        const dao = getDAO(bindingsManager, appNode);
        const appAddress = interpretNodeSync(appNode, bindingsManager);

        if (
          !grantee ||
          !isAddress(grantee) ||
          !appAddress ||
          !isAddress(appAddress)
        ) {
          return [];
        }

        // Get the available roles for the given grantee on the given app
        return getAppRoles(bindingsManager, appAddress).filter(
          (role) => !dao.hasPermission(grantee, appAddress, role),
        );
      }
      case 3: {
        const appNode = nodeArgs[1];
        const dao = getDAO(bindingsManager, appNode);
        const appAddress = interpretNodeSync(appNode, bindingsManager);
        const role = interpretNodeSync(nodeArgs[2], bindingsManager);

        if (
          !appAddress ||
          !role ||
          dao.hasPermissionManager(appAddress, role)
        ) {
          return [];
        }

        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [BindingsSpace.ADDR],
        });
      }
    }
    return [];
  },
  async runEagerExecution(c) {
    return (eagerBindingsManager) => {
      const dao = getDAO(eagerBindingsManager, c.args[1]);
      const argValues = c.args.map((arg) =>
        interpretNodeSync(arg, eagerBindingsManager),
      );

      if (!isPermission(argValues)) {
        return;
      }

      _grant(dao, argValues);
    };
  },
});
