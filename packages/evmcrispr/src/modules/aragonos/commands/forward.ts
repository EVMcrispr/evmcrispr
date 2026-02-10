import { isAddress } from "viem";

import { ErrorException } from "../../../errors";
import type { Action, TransactionAction } from "../../../types";
import { isTransactionAction } from "../../../types";
import { commaListItems, defineCommand } from "../../../utils";
import type { AragonOS } from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

export default defineCommand<AragonOS>({
  name: "forward",
  args: [
    { name: "forwarder", type: "any", skipInterpret: true },
    {
      name: "forwardersAndBlock",
      type: "any",
      rest: true,
      skipInterpret: true,
    },
  ],
  opts: [
    { name: "context", type: "string" },
    { name: "check-forwarder", type: "string" },
  ],
  async run(module, _args, { opts, node, interpreters }) {
    const { interpretNode, interpretNodes } = interpreters;

    const blockCommandsNode = node.args[node.args.length - 1];
    const forwarderArgNodes = node.args.slice(0, -1);

    const forwarderAppAddresses = await interpretNodes(
      forwarderArgNodes,
      false,
      {
        allowNotFoundError: true,
      },
    );

    const invalidForwarderApps: any[] = [];

    forwarderAppAddresses.forEach((a) =>
      !isAddress(a) ? invalidForwarderApps.push(a) : undefined,
    );

    if (invalidForwarderApps.length) {
      throw new ErrorException(
        `${commaListItems(
          invalidForwarderApps,
        )} are not valid forwarder address`,
      );
    }

    const blockActions = (await interpretNode(blockCommandsNode, {
      blockModule: module.contextualName,
    })) as Action[];

    if (blockActions.find((a) => !isTransactionAction(a))) {
      throw new ErrorException(
        `can't use non-transaction actions inside a forward command`,
      );
    }

    return batchForwarderActions(
      module,
      blockActions as TransactionAction[],
      forwarderAppAddresses.reverse(),
      opts.context,
      opts["check-forwarder"],
    );
  },
  buildCompletionItemsForArg(_, __, bindingsManager) {
    return getDAOAppIdentifiers(bindingsManager);
  },
  async runEagerExecution() {
    return;
  },
});
