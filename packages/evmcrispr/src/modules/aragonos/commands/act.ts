import { utils } from 'ethers';

import type { CommandFunction } from '../../../types';
import { batchForwarderActions } from '../utils/forwarders';
import { ErrorException } from '../../../errors';
import {
  ComparisonType,
  SIGNATURE_REGEX,
  checkArgsLength,
  encodeAction,
} from '../../../utils';
import type { AragonOS } from '../AragonOS';

export const act: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Greater,
    minValue: 3,
  });

  const [agentAddress, targetAddress, signature, ...params] = await Promise.all(
    c.args.map((arg, i) => {
      if (i < 2) {
        return interpretNode(arg, { allowNotFoundError: true });
      }

      return interpretNode(arg);
    }),
  );

  if (!utils.isAddress(agentAddress)) {
    throw new ErrorException(
      `expected a valid agent address, but got ${agentAddress}`,
    );
  }
  if (!utils.isAddress(targetAddress)) {
    throw new ErrorException(
      `expected a valid target address, but got ${targetAddress}`,
    );
  }

  if (!SIGNATURE_REGEX.test(signature)) {
    throw new ErrorException(
      `expected a valid signature, but got ${signature}`,
    );
  }

  const execAction = encodeAction(targetAddress, signature, params);

  return batchForwarderActions(module.signer, [execAction], [agentAddress]);
};
