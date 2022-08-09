import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { encodeAction } from '../../../utils/encoders';
import type { Std } from '../Std';

export const exec: CommandFunction<Std> = async (_, c, { interpretNodes }) => {
  checkArgsLength(c, { type: ComparisonType.Greater, minValue: 3 });

  const [targetAddress, signature, ...params] = await interpretNodes(c.args);

  return [encodeAction(targetAddress, signature, params)];
};
