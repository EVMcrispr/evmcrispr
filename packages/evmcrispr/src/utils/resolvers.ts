import type { BigNumber } from 'ethers';
import { utils } from 'ethers';

import { ErrorInvalid, ErrorNotFound } from '../errors';
import type EVMcrispr from '../EVMcrispr';
import type { Address, App, Entity, Permission } from '../types';
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from './acl';
import { resolveIdentifier } from './identifiers';
import { normalizeRole } from './normalizers';
import { timeUnits } from './parsers';
import { toDecimals } from './web3';

export default function resolver(evmcrispr: EVMcrispr) {
  function resolveApp(entity: Entity): App {
    if (!evmcrispr.aragon.dao) {
      throw new Error('Not connected to any DAO');
    }
    if (utils.isAddress(entity)) {
      const app = [...evmcrispr.aragon.dao.appCache.entries()].find(
        ([, app]) => app.address === entity,
      );

      if (!app) {
        throw new ErrorNotFound(`Address ${entity} doesn't match any app.`, {
          name: 'ErrorAppNotFound',
        });
      }

      return app[1];
    }
    const resolvedIdentifier = resolveIdentifier(entity);

    if (!evmcrispr.aragon.dao.appCache.has(resolvedIdentifier)) {
      throw new ErrorNotFound(`App ${resolvedIdentifier} not found.`, {
        name: 'ErrorAppNotFound',
      });
    }

    return evmcrispr.aragon.dao.appCache.get(resolvedIdentifier)!;
  }

  function resolveEntity(entity: Entity): Address {
    switch (entity) {
      case 'ANY_ENTITY':
        return ANY_ENTITY;
      case 'NO_ENTITY':
      case 'ETH':
      case 'XDAI':
      case 'ZERO_ADDRESS':
        return NO_ENTITY;
      case 'BURN_ENTITY':
        return BURN_ENTITY;
      default:
        if (evmcrispr.addressBook.has(entity)) {
          return evmcrispr.addressBook.get(entity)!;
        }
        return utils.isAddress(entity) ? entity : resolveApp(entity).address;
    }
  }

  function resolveNumber(number: string | number): BigNumber | number {
    if (typeof number === 'string') {
      const [, amount, decimals = '0', unit = 's', inverse = 's'] = String(
        number,
      ).match(
        /^(\d*(?:\.\d*)?)(?:e(\d+))?(mo|s|m|h|d|w|y)?(?:\/(mo|s|m|h|d|w|y))?$/,
      )!;
      return toDecimals(amount, parseInt(decimals))
        .mul(timeUnits[unit])
        .div(timeUnits[inverse]);
    }
    return number;
  }

  function resolveBoolean(boolean: string | boolean): boolean {
    if (typeof boolean === 'string') {
      if (boolean === 'false') {
        return false;
      }
      if (boolean === 'true') {
        return true;
      }
      throw new Error(
        `Parameter should be a boolean ("true" or "false"), "${boolean}" given.`,
      );
    }
    return !!boolean;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  function resolveBytes(bytes: any, max = 0): string {
    if (typeof bytes === 'string' && !bytes.startsWith('0x')) {
      bytes = utils.hexlify(utils.toUtf8Bytes(bytes)).padEnd(max * 2 + 2, '0');
    }
    bytes = bytes.toString();
    if (!bytes.startsWith('0x') || (bytes.length > max * 2 + 2 && max > 0)) {
      throw new Error(`Parameter should contain less than ${max} bytes.`);
    }
    return bytes;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  function resolveParam(param: any, type: string): any {
    if (/\[\d*\]$/g.test(type)) {
      if (!Array.isArray(param)) {
        throw new Error(
          `Parameter ${type} should be an array, ${param} given.`,
        );
      }
      return param.map((param: any[]) =>
        resolveParam(param, type.slice(0, type.lastIndexOf('['))),
      );
    }
    if (type === 'address') {
      return resolveEntity(param);
    }
    if (/^u?int(\d)*$/.test(type)) {
      return resolveNumber(param);
    }
    if (type === 'bool') {
      return resolveBoolean(param);
    }
    if (/^bytes(\d*)$/.test(type)) {
      return resolveBytes(
        param,
        parseInt(type.match(/^bytes(\d*)$/)![1] || '0'),
      );
    }
    return param;
  }

  function resolveParams(params: any[], types: string[]): any[] {
    return params
      .map((param) => (param instanceof Function ? param() : param))
      .map((param, i) => resolveParam(param, types[i]));
  }

  async function resolvePromises(
    params: any[],
    types: string[],
  ): Promise<any[]> {
    const _params = [];
    for (const param of params) {
      _params.push(
        await Promise.resolve(typeof param === 'function' ? param() : param),
      );
    }
    return resolveParams(_params, types);
  }

  function resolvePermission(
    permission: Permission,
  ): [Address, Address, string] {
    if (!permission[0]) {
      throw new ErrorInvalid(`Permission not well formed, grantee missing`, {
        name: 'ErrorInvalidIdentifier',
      });
    }
    if (!permission[1]) {
      throw new ErrorInvalid(`Permission not well formed, app missing`, {
        name: 'ErrorInvalidIdentifier',
      });
    }
    if (!permission[2]) {
      throw new ErrorInvalid(`Permission not well formed, role missing`, {
        name: 'ErrorInvalidIdentifier',
      });
    }
    return permission.map((entity, index) =>
      index < permission.length - 1
        ? resolveEntity(entity)
        : normalizeRole(entity),
    ) as [Address, Address, string];
  }

  return {
    resolveApp,
    resolveEntity,
    resolveNumber,
    resolveBoolean,
    resolveBytes,
    resolveParam,
    resolveParams,
    resolvePromises,
    resolvePermission,
  };
}
