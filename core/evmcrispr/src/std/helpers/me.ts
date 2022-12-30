import type { HelperFunction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

export const me: HelperFunction<Std> = async (module, h) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 0,
  });

  return module.getConnectedAccount(true);
};
