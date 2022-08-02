import type { RawHelperFunction } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
} from '../../../utils';
import type { Std } from '../Std';

export const me: RawHelperFunction<Std> = (module, ...args) => {
  checkArgsLength('me', CallableExpression.Helper, args.length, {
    type: ComparisonType.Equal,
    minValue: 0,
  });

  return module.signer.getAddress();
};
