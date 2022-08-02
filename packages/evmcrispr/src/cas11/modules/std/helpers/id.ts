import { utils } from 'ethers';

import type { RawHelperFunction } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
} from '../../../utils';
import type { Std } from '../Std';

export const id: RawHelperFunction<Std> = async (
  _,
  ...args
): Promise<string> => {
  checkArgsLength('id', CallableExpression.Helper, args.length, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [text] = args;
  return utils.id(text);
};
