import { utils } from 'ethers';

import type { Action } from '../../../..';
import { ErrorInvalid, ErrorNotFound } from '../../../../errors';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
  resolveLazyNodes,
} from '../../../utils';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';

const { Command } = CallableExpression;

const revokePanic = (ErrorConstructor: any, msg: string) =>
  Interpreter.panic(
    CallableExpression.Command,
    'revoke',
    ErrorConstructor,
    msg,
  );

export const revoke: CommandFunction<AragonOS> = async (
  aragonos,
  lazyNodes,
) => {
  checkArgsLength('revoke', Command, lazyNodes.length, {
    type: ComparisonType.Between,
    minValue: 3,
    maxValue: 4,
  });

  const dao = aragonos.getCurrentDAO();

  if (!dao || !(dao instanceof AragonDAO)) {
    revokePanic(ErrorInvalid, 'must be used within a "connect" command');
  }

  const [granteeAddress, appAddress, role, removeManager] =
    await resolveLazyNodes(lazyNodes);

  if (!utils.isAddress(granteeAddress)) {
    revokePanic(
      ErrorInvalid,
      `grantee must be a valid address, got ${granteeAddress}`,
    );
  }

  const removeManagerType = typeof removeManager;
  if (removeManagerType !== 'undefined' && removeManagerType !== 'boolean') {
    revokePanic(
      ErrorInvalid,
      `invalid remove manager flag. Expected boolean but got ${typeof removeManager}`,
    );
  }

  const roleHash = utils.id(role);
  const { permissions: appPermissions, name } = dao!.resolveApp(appAddress);
  const { address: aclAddress, abiInterface: aclAbiInterface } =
    dao!.resolveApp('acl');

  if (!appPermissions.has(roleHash)) {
    revokePanic(
      ErrorNotFound,
      `given permission doesn't exists on app ${name}`,
    );
  }

  const appPermission = appPermissions.get(roleHash)!;
  if (!appPermission.grantees.has(granteeAddress.toLowerCase())) {
    revokePanic(
      ErrorNotFound,
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
