import type { EVMcrispr } from '../../..';
import type { LazyString } from '../../../types';
import aragonEns from './aragonEns';

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
    aragonEns: lazy(evm, aragonEns),
  };
}
