import { default as token, tokenBalance } from './token';
import { default as me } from './me';
import type { EVMcrispr } from '..';
import type { LazyString } from '../types';

function lazy(
  func: (evm: EVMcrispr, ...params: string[]) => Promise<string>,
): (evm: EVMcrispr, ...params: LazyString[]) => LazyString {
  return (evm: EVMcrispr, ...params: LazyString[]) => {
    return async () => {
      const resolved: any = [];
      for (const param of params) {
        resolved.push(typeof param === 'function' ? await param() : param);
      }
      return func(evm, ...resolved);
    };
  };
}

export default {
  token: lazy(token),
  'token.balance': lazy(tokenBalance),
  me: lazy(me),
};
