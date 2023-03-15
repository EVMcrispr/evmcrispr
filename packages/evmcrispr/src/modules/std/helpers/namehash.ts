import { utils } from 'ethers';

import type { HelperFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';

export const namehash: HelperFunction<Std> = async (
  _,
  h,
  { interpretNodes },
): Promise<string> => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [name] = await interpretNodes(h.args);

  try {
    return utils.namehash(name);
  } catch (e) {
    throw new Error(
      'Invalid ENS name. Please check the value you are passing to @namehash',
    );
  }
};
