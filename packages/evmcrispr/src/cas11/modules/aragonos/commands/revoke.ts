import { utils } from 'ethers';

import type { Action } from '../../../..';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';

export const revoke: CommandFunction<AragonOS> = async (
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

  const [granteeAddress, appAddress, role, removeManager] =
    await interpretNodes(c.args);

  if (!utils.isAddress(granteeAddress)) {
    Interpreter.panic(
      c,
      `grantee must be a valid address, got ${granteeAddress}`,
    );
  }

  const removeManagerType = typeof removeManager;
  if (removeManagerType !== 'undefined' && removeManagerType !== 'boolean') {
    Interpreter.panic(
      c,
      `invalid remove manager flag. Expected boolean but got ${typeof removeManager}`,
    );
  }

  const roleHash = utils.id(role);
  const app = dao.resolveApp(appAddress);

  if (!app) {
    Interpreter.panic(c, `${appAddress} is not a DAO's app`);
  }

  const { permissions: appPermissions, name } = app;
  const { address: aclAddress, abiInterface: aclAbiInterface } =
    dao!.resolveApp('acl')!;

  if (!appPermissions.has(roleHash)) {
    Interpreter.panic(c, `given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;
  if (!appPermission.grantees.has(granteeAddress.toLowerCase())) {
    Interpreter.panic(
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
