import type { Action, CommandFunction, InterpretOptions } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { EVMcrispr } from '../../../EVMcrispr';
import type { AragonOS } from '../AragonOS';
import { checkPermissionFormat, getDAO } from '../utils/commands';
import type { FullPermission } from '../types';
import { normalizeRole } from '../utils';

export const revoke: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Between,
    minValue: 3,
    maxValue: 4,
  });

  const dao = getDAO(module, c, 1);

  const args = await Promise.all(
    c.args.map((arg, i) => {
      const opts: Partial<InterpretOptions> | undefined =
        i < 2 ? { allowNotFoundError: true } : undefined;
      return interpretNode(arg, opts);
    }),
  );

  checkPermissionFormat(c, args.slice(0, 3) as FullPermission);

  const [granteeAddress, appAddress, role, removeManager] = args;

  const removeManagerType = typeof removeManager;
  if (removeManagerType !== 'undefined' && removeManagerType !== 'boolean') {
    EVMcrispr.panic(
      c,
      `invalid remove manager flag. Expected boolean but got ${typeof removeManager}`,
    );
  }

  const roleHash = normalizeRole(role);
  const app = dao.resolveApp(appAddress);

  if (!app) {
    EVMcrispr.panic(c, `${appAddress} is not a DAO's app`);
  }

  const { permissions: appPermissions, name } = app;
  const { address: aclAddress, abiInterface: aclAbiInterface } =
    dao!.resolveApp('acl')!;

  if (!appPermissions.has(roleHash)) {
    EVMcrispr.panic(c, `given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;
  if (!appPermission.grantees.has(granteeAddress.toLowerCase())) {
    EVMcrispr.panic(
      c,
      `grantee ${granteeAddress} doesn't have the given permission`,
    );
  }

  appPermission.grantees.delete(granteeAddress);

  const actions: Action[] = [];

  actions.push({
    to: aclAddress,
    data: aclAbiInterface.encodeFunctionData('revokePermission', [
      granteeAddress,
      appAddress,
      roleHash,
    ]),
  });

  if (removeManager) {
    delete appPermission.manager;
    actions.push({
      to: aclAddress,
      data: aclAbiInterface.encodeFunctionData('removePermissionManager', [
        appAddress,
        roleHash,
      ]),
    });
  }

  return actions;
};
