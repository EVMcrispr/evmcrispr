import { constants } from 'ethers';

import type { ActionFunction, Entity, Permission, PermissionP } from '../../..';
import { ErrorException, ErrorInvalid, ErrorNotFound } from '../../../errors';
import type { ConnectedAragonOS } from '../AragonOS';

/**
 * Encode an action that creates a new app permission or grant it if it already exists.
 * @param permission The permission to create.
 * @param defaultPermissionManager The [[Entity | entity]] to set as the permission manager.
 * @returns A function that returns the permission action.
 */
export function grant(
  module: ConnectedAragonOS,
  permission: Permission | PermissionP,
  defaultPermissionManager: Entity,
): ActionFunction {
  return async () => {
    const [grantee, app, role, getParams = () => []] = permission;
    const [granteeAddress, appAddress, roleHash] =
      module.evm.resolver.resolvePermission([grantee, app, role]);

    if (!defaultPermissionManager) {
      throw new ErrorInvalid(
        `Permission not well formed, permission manager missing`,
        {
          name: 'ErrorInvalidIdentifier',
        },
      );
    }

    const params = getParams();
    const manager = module.resolveEntity(defaultPermissionManager);
    const { permissions: appPermissions } = module.resolveApp(app);
    const { address: aclAddress, abiInterface: aclAbiInterface } =
      module.resolveApp('acl');
    const actions = [];

    if (!appPermissions.has(roleHash)) {
      throw new ErrorNotFound(
        `Permission ${role} doesn't exists in app ${app}.`,
      );
    }

    const appPermission = appPermissions.get(roleHash)!;

    // If the permission already existed and no parameters are needed, just grant to a new entity and exit
    if (
      appPermission.manager !== '' &&
      appPermission.manager !== constants.AddressZero &&
      params.length == 0
    ) {
      if (appPermission.grantees.has(granteeAddress)) {
        throw new ErrorException(
          `Grantee ${grantee} already has permission ${role}`,
        );
      }
      appPermission.grantees.add(granteeAddress);

      return [
        {
          to: aclAddress,
          data: aclAbiInterface.encodeFunctionData('grantPermission', [
            granteeAddress,
            appAddress,
            roleHash,
          ]),
        },
      ];
    }

    // If the permission does not exist previously, create it
    if (
      appPermission.manager === '' ||
      appPermission.manager === constants.AddressZero
    ) {
      appPermissions.set(roleHash, {
        manager,
        grantees: new Set([granteeAddress]),
      });

      actions.push({
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData('createPermission', [
          granteeAddress,
          appAddress,
          roleHash,
          manager,
        ]),
      });
    }

    // If we need to set up parameters we call the grantPermissionP function, even if we just created the permission
    if (params.length > 0) {
      if (appPermission.grantees.has(granteeAddress)) {
        throw new ErrorException(
          `Grantee ${grantee} already has permission ${role}.`,
        );
      }
      appPermission.grantees.add(granteeAddress);

      actions.push({
        to: aclAddress,
        data: aclAbiInterface.encodeFunctionData('grantPermissionP', [
          granteeAddress,
          appAddress,
          roleHash,
          params,
        ]),
      });
    }

    return actions;
  };
}
