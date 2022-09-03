import { utils } from 'ethers';

import type { Action, CommandFunction } from '../../../types';
import type { ErrorException } from '../../../errors';

import { batchForwarderActions } from '../utils/forwarders';
import { EVMcrispr } from '../../../EVMcrispr';
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
    EVMcrispr.panic(
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
    EVMcrispr.panic(c, err_.message);
  }

  return forwarderActions;
};
