import type { ActionFunction, Permission } from '../../..';
import { ErrorNotFound } from '../../../errors';
import type AragonOS from '../AragonOS';

/**
 * Encode an action that revokes an app permission.
 * @param permission The permission to revoke.
 * @param removeManager A boolean that indicates whether or not to remove the permission manager.
 * @returns A function that returns the revoking actions.
 */
export function revoke(
  module: AragonOS,
  permission: Permission,
  removeManager = false,
): ActionFunction {
  return async () => {
    const actions = [];
    const [grantee, app, role] = permission;
    const [entityAddress, appAddress, roleHash] =
      module.evm.resolver.resolvePermission(permission);
    const { permissions: appPermissions } = module.evm.resolver.resolveApp(app);
    const { address: aclAddress, abiInterface: aclAbiInterface } =
      module.evm.resolver.resolveApp('acl');

    if (!appPermissions.has(roleHash)) {
      throw new ErrorNotFound(
        `Permission ${role} doesn't exists in app ${app}.`,
      );
    }

    const appPermission = appPermissions.get(roleHash)!;

    if (!appPermission.grantees.has(entityAddress)) {
      throw new ErrorNotFound(
        `Entity ${grantee} doesn't have permission ${role} to be revoked.`,
        {
          name: 'ErrorPermissionNotFound',
        },
      );
    }

    appPermission.grantees.delete(entityAddress);

    actions.push({
      to: aclAddress,
      data: aclAbiInterface.encodeFunctionData('revokePermission', [
        entityAddress,
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
}
