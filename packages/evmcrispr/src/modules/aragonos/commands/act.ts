import { utils } from 'ethers';

import type { Action, CommandFunction } from '../../../types';

import { batchForwarderActions } from '../utils/forwarders';
import {
  ComparisonType,
  SIGNATURE_REGEX,
  checkArgsLength,
  encodeAction,
} from '../../../utils';
import { EVMcrispr } from '../../../EVMcrispr';
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
    EVMcrispr.panic(
      c,
      `expected a valid agent address, but got ${agentAddress}`,
    );
  }
  if (!utils.isAddress(targetAddress)) {
    EVMcrispr.panic(
      c,
      `expected a valid target address, but got ${targetAddress}`,
    );
  }

  if (!SIGNATURE_REGEX.test(signature)) {
    EVMcrispr.panic(c, `expected a valid signature, but got ${signature}`);
  }

  let execAction: Action;

  try {
    execAction = encodeAction(targetAddress, signature, params);
  } catch (err) {
    const err_ = err as Error;
    EVMcrispr.panic(c, err_.message);
  }

  return batchForwarderActions(module.signer, [execAction], [agentAddress]);
};
