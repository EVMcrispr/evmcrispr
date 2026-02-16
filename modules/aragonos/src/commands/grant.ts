import type { Action } from "@evmcrispr/sdk";
import {
  AddressSet,
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  interpretNodeSync,
} from "@evmcrispr/sdk";
import { isAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import type { AragonDAO } from "../AragonDAO";
import type { CompletePermission, Params } from "../types";
import { getAppRoles, getDAOAppIdentifiers, oracle } from "../utils";
import {
  getDAO,
  isPermission,
  resolvePermissionContext,
} from "../utils/commands";

const _grant = (dao: AragonDAO, permission: CompletePermission): Action[] => {
  const [granteeAddress, appAddress, role, permissionManager, params = []] =
    permission;

  const { appPermissions, appPermission, aclAddress, roleHash, app } =
    resolvePermissionContext(dao, appAddress, role);
  const { name } = app;
  const actions: Action[] = [];

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
    { name: "grantee", type: "address" },
    { name: "app", type: "app" },
    { name: "role", type: "permission" },
    { name: "permissionManager", type: "app", optional: true },
  ],
  opts: [{ name: "oracle", type: "address" }],
  async run(module, { grantee, app, role, permissionManager }, { opts }) {
    const oracleOpt = opts.oracle;

    let params: ReturnType<Params> = [];

    if (oracleOpt) {
      params = oracle(oracleOpt)();
    }

    const permission: CompletePermission = [grantee, app, role, permissionManager, params];

    // Find the DAO that owns the app by searching all connected DAOs
    const dao = isAddress(app)
      ? (module.connectedDAOs.find((d) => d.resolveApp(app)) ??
        module.currentDAO)
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException('must be used within a "connect" command');
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
