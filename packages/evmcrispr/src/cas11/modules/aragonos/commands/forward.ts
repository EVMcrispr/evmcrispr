import { utils } from 'ethers';

import type { Action } from '../../../..';
import type { ErrorException } from '../../../../errors';

import { batchForwarderActions } from '../../../../modules/aragonos/utils/forwarders';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import {
  ComparisonType,
  checkArgsLength,
  commaListItems,
} from '../../../utils';
import type { AragonOS } from '../AragonOS';

export const forward: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Greater,
    minValue: 2,
  });

  const blockCommandsNode = c.args.pop()!;

  const forwarderAppAddresses = await interpretNodes(c.args, false, {
    allowNotFoundError: true,
  });

  const invalidForwarderApps: any[] = [];

  forwarderAppAddresses.forEach((a) =>
    !utils.isAddress(a) ? invalidForwarderApps.push(a) : undefined,
  );

  if (invalidForwarderApps.length) {
    Interpreter.panic(
      c,
      `${commaListItems(invalidForwarderApps)} are not valid forwarder address`,
    );
  }

  const blockCommands = await interpretNode(blockCommandsNode, {
    blockModule: module.contextualName,
  });

  let forwarderActions: Action[] = [];

  try {
    forwarderActions = await batchForwarderActions(
      module.signer,
      blockCommands,
      forwarderAppAddresses.reverse(),
    );
  } catch (err) {
    const err_ = err as ErrorException;
    Interpreter.panic(c, err_.message);
  }

  return forwarderActions;
};
