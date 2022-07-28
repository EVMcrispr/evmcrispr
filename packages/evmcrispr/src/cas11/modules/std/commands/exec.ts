import type { CommandFunction } from '../../../types';
import { encodeAction } from '../../../utils/encoders';
import { resolveLazyNodes } from '../../../utils/resolvers';
import type { Std } from '../Std';

const errorPrefix = 'Exec command error';

export const exec: CommandFunction<Std> = async (_, lazyNodes) => {
  if (lazyNodes.length < 2) {
    throw new Error(
      `${errorPrefix}: invalid number of arguments. Expected at least 3`,
    );
  }

  const [targetAddress, signature, ...params] = await resolveLazyNodes(
    lazyNodes,
  );

  return [encodeAction(targetAddress, signature, params)];
};
