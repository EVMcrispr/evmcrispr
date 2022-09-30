import { constants, utils } from 'ethers';

import { ErrorException } from '../../../errors';
import type { Action, ICommand, InterpretOptions } from '../../../types';
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from '../../../utils';
import type { AragonOS } from '../AragonOS';
import { checkPermissionFormat, getDAO } from '../utils/commands';
import { normalizeRole, oracle } from '../utils';
import type { FullPermission, Params } from '../types';

export const grant: ICommand<AragonOS> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 3,
      maxValue: 4,
    });
    checkOpts(c, ['oracle']);

    const dao = getDAO(module, c, 1);

    const permissionMangerArgNode = c.args[3];
    const permission = await Promise.all(
      c.args.slice(0, 3).map((arg, i) => {
        const opts: Partial<InterpretOptions> | undefined =
          i !== 2 ? { allowNotFoundError: true } : undefined;

        return interpretNode(arg, opts);
      }),
    );

    checkPermissionFormat(permission as FullPermission);

    const [granteeAddress, appAddress, role] = permission;

    const roleHash = normalizeRole(role);

    const app = dao.resolveApp(appAddress);

    if (!app) {
      throw new ErrorException(`${appAddress} is not a DAO's app`);
    }

    const { permissions: appPermissions, name } = app;
    const { address: aclAddress, abiInterface: aclAbiInterface } =
      dao!.resolveApp('acl')!;
    const actions: Action[] = [];

    if (!appPermissions.has(roleHash)) {
      // TODO: get app identifier. Maybe set it on cache
      throw new ErrorException(
        `given permission doesn't exists on app ${name}`,
      );
    }

    const appPermission = appPermissions.get(roleHash)!;

    const oracleOpt = await getOptValue(c, 'oracle', interpretNode);
    let params: ReturnType<Params> = [];

    if (oracleOpt && !utils.isAddress(oracleOpt)) {
      throw new ErrorException(
        `invalid --oracle option. Expected an address, but got ${oracleOpt}`,
      );
    }

    if (oracleOpt) {
      params = oracle(oracleOpt)();
    }

    // If the permission already existed and no parameters are needed, just grant to a new entity and exit
    if (
      appPermission.manager !== '' &&
      appPermission.manager !== constants.AddressZero &&
      params.length == 0
    ) {
      if (appPermission.grantees.has(granteeAddress)) {
        // TODO: get app identifier. Maybe set it on cache
        throw new ErrorException(
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
      if (!permissionMangerArgNode) {
        throw new ErrorException('required permission manager missing');
      }

      const defaultPermissionManagerAddress = await interpretNode(
        permissionMangerArgNode,
        { allowNotFoundError: true },
      );

      if (!utils.isAddress(defaultPermissionManagerAddress)) {
        throw new ErrorException(
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
    if (params.length > 0) {
      if (appPermission.grantees.has(granteeAddress)) {
        throw new ErrorException(
          `grantee ${granteeAddress} already has given permission on app ${name}`,
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
  },
};
