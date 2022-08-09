import { constants, utils } from 'ethers';

import type { Action } from '../../../..';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';

// TODO: add support to permission params
export const grant: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNodes },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Between,
    minValue: 3,
    maxValue: 4,
  });

  const dao = module.currentDAO;

  if (!dao || !(dao instanceof AragonDAO)) {
    Interpreter.panic(c, 'must be used within a "connect" command');
  }

  const [granteeAddress, appAddress, role, defaultPermissionManagerAddress] =
    await interpretNodes(c.args);
  const roleHash = utils.id(role);
  const app = dao.resolveApp(appAddress);

  if (!app) {
    Interpreter.panic(c, `${appAddress} is not a DAO's app`);
  }

  const { permissions: appPermissions, name } = app;
  const { address: aclAddress, abiInterface: aclAbiInterface } =
    dao!.resolveApp('acl')!;
  const actions: Action[] = [];

  if (!appPermissions.has(roleHash)) {
    // TODO: get app identifier. Maybe set it on cache
    Interpreter.panic(c, `given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;

  // If the permission already existed and no parameters are needed, just grant to a new entity and exit
  if (
    appPermission.manager !== '' &&
    appPermission.manager !== constants.AddressZero
    // && params.length == 0
  ) {
    if (appPermission.grantees.has(granteeAddress)) {
      // TODO: get app identifier. Maybe set it on cache
      Interpreter.panic(
        c,
        `grantee already has given permission on app ${name}`,
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
    if (!defaultPermissionManagerAddress) {
      Interpreter.panic(c, 'permission manager missing');
    } else if (!utils.isAddress(defaultPermissionManagerAddress)) {
      Interpreter.panic(
        c,
        `invalid permission manager. Expected an address, but got ${defaultPermissionManagerAddress}`,
      );
    }
    appPermissions.set(roleHash, {
      manager: defaultPermissionManagerAddress,
      grantees: new Set([granteeAddress]),
    });

    actions.push({
      to: aclAddress,
      data: aclAbiInterface.encodeFunctionData('createPermission', [
        granteeAddress,
        appAddress,
        roleHash,
        defaultPermissionManagerAddress,
      ]),
    });
  }

  // If we need to set up parameters we call the grantPermissionP function, even if we just created the permission
  // if (params.length > 0) {
  //   if (appPermission.grantees.has(granteeAddress)) {
  //     throw new ErrorException(
  //       `Grantee ${grantee} already has permission ${role}.`,
  //     );
  //   }
  //   appPermission.grantees.add(granteeAddress);

  //   actions.push({
  //     to: aclAddress,
  //     data: aclAbiInterface.encodeFunctionData('grantPermissionP', [
  //       granteeAddress,
  //       appAddress,
  //       roleHash,
  //       params,
  //     ]),
  //   });
  // }

  return actions;
};
