import type { Action, TransactionAction } from "@evmcrispr/sdk";
import { commaListItems, defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddress } from "viem";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import {
  assertAllTransactionActions,
  batchForwarderActions,
} from "../utils/forwarders";

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

    const forwarderAppAddresses = await interpretNodes(forwarderArgNodes);

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

    assertAllTransactionActions(blockActions, "forward");

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
