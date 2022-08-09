import { utils } from 'ethers';

import { batchForwarderActions } from '../../../../modules/aragonos/utils/forwarders';
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
    Interpreter.panic(c, 'expected a valid agent address');
  }
  if (!utils.isAddress(targetAddress)) {
    Interpreter.panic(c, 'expected a valid target address');
  }
  if (typeof signature !== 'string') {
    Interpreter.panic(c, 'expected a valid signature');
  }

  return batchForwarderActions(
    module.signer,
    [encodeAction(targetAddress, signature, params)],
    [agentAddress],
  );
};
