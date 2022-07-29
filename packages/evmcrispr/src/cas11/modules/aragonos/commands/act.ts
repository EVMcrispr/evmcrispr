import { utils } from 'ethers';

import { ErrorException } from '../../../../errors';
import { encodeActCall, encodeCallScript } from '../../../../utils';
import type { CommandFunction } from '../../../types';
import { encodeAction } from '../../../utils/encoders';
import { resolveLazyNodes } from '../../../utils/resolvers';
import type { AragonOS } from '../AragonOS';

const errorPrefix = 'Act command error';

export const act: CommandFunction<AragonOS> = async (_, lazyNodes) => {
  if (lazyNodes.length < 3) {
    throw new Error(
      `${errorPrefix}: expected at least 3 arguments. Got ${lazyNodes.length}`,
    );
  }

  const [agentAddress, targetAddress, signature, ...params] =
    await resolveLazyNodes(lazyNodes);

  if (!utils.isAddress(agentAddress)) {
    throw new ErrorException(`${errorPrefix}: invalid agent address`);
  }
  if (!utils.isAddress(targetAddress)) {
    throw new ErrorException(`${errorPrefix}: invalid target address`);
  }
  if (typeof signature !== 'string') {
    throw new ErrorException(
      `${errorPrefix}: invalid signature. Expected string`,
    );
  }

  return [
    {
      to: agentAddress,
      data: encodeActCall('forward(bytes)', [
        encodeCallScript([encodeAction(targetAddress, signature, params)]),
      ]),
    },
  ];
};
