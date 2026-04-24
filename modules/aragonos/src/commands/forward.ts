import type {
  Action,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import { commaListItems, defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddress } from "viem";
import type AragonOS from "..";
import {
  assertAllTransactionActions,
  batchForwarderActions,
} from "../utils/forwarders";

export default defineCommand<AragonOS>({
  name: "forward",
  description:
    "Route actions through a chain of forwarder apps with optional context.",
  args: [
    {
      name: "forwarders",
      type: "app",
      rest: true,
      description: "Forwarding path through apps",
    },
    { name: "block", type: "block", description: "Commands to forward" },
  ],
  opts: [
    {
      name: "context",
      type: "string",
      description: "Context string attached to the forwarding",
    },
    {
      name: "check-forwarder",
      type: "bool",
      description: "Verify forwarder can forward before submitting",
    },
  ],
  async run(module, { forwarders = [], block }, { opts, interpreters }) {
    const { interpretNode } = interpreters;

    const forwarderAppAddresses = forwarders as any[];

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

    const blockActions = (await interpretNode(block as BlockExpressionNode, {
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
});
