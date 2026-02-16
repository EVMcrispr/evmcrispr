import type { Action } from "@evmcrispr/sdk";
import {
  AddressSet,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  interpretNodeSync,
} from "@evmcrispr/sdk";
import { isAddress, zeroAddress } from "viem";
import type AragonOS from "..";
import type { AragonDAO } from "../AragonDAO";
import type { CompletePermission, Params } from "../types";
import { getAppRoles } from "../utils";
import { getDAO, resolvePermissionContext } from "../utils/commands";

const _grant = (dao: AragonDAO, permission: CompletePermission): Action[] => {
  const [granteeAddress, appAddress, role, permissionManager, params = []] =
    permission;

  const { appPermissions, appPermission, aclAddress, roleHash, app } =
    resolvePermissionContext(dao, appAddress, role);
  const { name } = app;
  const actions: Action[] = [];

  if (
    appPermission.manager &&
    appPermission.manager !== zeroAddress &&
    params.length === 0
  ) {
    if (appPermission.grantees.has(granteeAddress)) {
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
  completions: {
    role: (ctx) => {
      const grantee = interpretNodeSync(ctx.nodeArgs[0], ctx.bindings);
      const app = interpretNodeSync(ctx.nodeArgs[1], ctx.bindings);
      if (!grantee || !isAddress(grantee) || !app || !isAddress(app)) return [];
      const dao = getDAO(ctx.bindings, ctx.nodeArgs[1]);
      return getAppRoles(ctx.bindings, app, ctx.chainId)
        .filter((role) => !dao.hasPermission(grantee, app, role))
        .map(fieldItem);
    },
  },
  async run(module, { grantee, app, role, permissionManager }, { opts }) {
    const oracleOpt = opts.oracle;

    let params: ReturnType<Params> = [];

    if (oracleOpt) {
      const { oracle } = await import("../utils");
      params = oracle(oracleOpt)();
    }

    const permission: CompletePermission = [
      grantee,
      app,
      role,
      permissionManager,
      params,
    ];

    const dao = isAddress(app)
      ? (module.connectedDAOs.find((d) => d.resolveApp(app)) ??
        module.currentDAO)
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException('must be used within a "connect" command');
    }

    return _grant(dao, permission);
  },
});
