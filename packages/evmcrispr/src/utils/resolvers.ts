import type { BigNumber } from 'ethers';
import { utils } from 'ethers';

import { ErrorNotFound } from '../errors';
import type EVMcrispr from '../EVMcrispr';
import type { Address, Entity } from '../types';
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from './acl';
import { resolveIdentifier } from './identifiers';
import { timeUnits } from './parsers';
import { toDecimals } from './web3';

export default function resolver(evmcrispr: EVMcrispr): {
  resolveEntity: (entity: Entity) => Address;
  resolveNumber: (number: string | number) => BigNumber | number;
  resolveBoolean: (boolean: string | boolean) => boolean;
  resolveBytes: (bytes: any, max: number) => string;
  resolveParam: (param: any, type: string) => any;
  resolveParams: (params: any[], types: string[]) => any[];
  resolvePromises: (params: any[], types: string[]) => Promise<any[]>;
} {
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
      default: {
        if (utils.isAddress(entity)) {
          return entity;
        }
        const id = resolveIdentifier(entity);
        if (evmcrispr.addressBook.has(id)) {
          return evmcrispr.addressBook.get(id)!;
        }
        throw new ErrorNotFound(`Entity ${entity} not found.`);
      }
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

  return {
    resolveEntity,
    resolveNumber,
    resolveBoolean,
    resolveBytes,
    resolveParam,
    resolveParams,
    resolvePromises,
  };
}
