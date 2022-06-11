import { default as token, tokenBalance } from './token';
import { default as me } from './me';
import type { EVMcrispr } from '../../..';
import type { LazyString } from '../../../types';

function lazy(
  evm: EVMcrispr,
  func: (evm: EVMcrispr, ...params: string[]) => Promise<string>,
): (...params: LazyString[]) => () => Promise<string> {
  return (...params: LazyString[]) => {
    return async () => {
      const resolved: any = [];
      for (const param of params) {
        resolved.push(typeof param === 'function' ? await param() : param);
      }
      return func(evm, ...resolved);
    };
  };
}

export default function (evm: EVMcrispr) {
  return {
    token: lazy(evm, token),
    'token.balance': lazy(evm, tokenBalance),
    me: lazy(evm, me),
  };
}