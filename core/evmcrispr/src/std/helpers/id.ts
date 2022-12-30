import { utils } from 'ethers';

import type { HelperFunction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

export const id: HelperFunction<Std> = async (
  _,
  h,
  { interpretNodes },
): Promise<string> => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [text] = await interpretNodes(h.args);

  return utils.id(text);
};
