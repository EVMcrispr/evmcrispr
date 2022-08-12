import { utils } from 'ethers';

import type { Action } from '../../../..';

import { batchForwarderActions } from '../../../../modules/aragonos/utils/forwarders';
import { SIGNATURE_REGEX } from '../../../../utils';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { encodeAction } from '../../../utils/encoders';
import type { AragonOS } from '../AragonOS';

export const act: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNodes },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Greater,
    minValue: 3,
  });

  const [agentAddress, targetAddress, signature, ...params] =
    await interpretNodes(c.args);

  if (!utils.isAddress(agentAddress)) {
    Interpreter.panic(
      c,
      `expected a valid agent address, but got ${agentAddress}`,
    );
  }
  if (!utils.isAddress(targetAddress)) {
    Interpreter.panic(
      c,
      `expected a valid target address, but got ${targetAddress}`,
    );
  }
  if (!SIGNATURE_REGEX.test(signature)) {
    Interpreter.panic(c, `expected a valid signature, but got ${signature}`);
  }

  let execAction: Action;

  try {
    execAction = encodeAction(targetAddress, signature, params);
  } catch (err) {
    const err_ = err as Error;
    Interpreter.panic(c, err_.message);
  }

  return batchForwarderActions(module.signer, [execAction], [agentAddress]);
};
