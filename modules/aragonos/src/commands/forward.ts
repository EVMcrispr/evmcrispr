import type {
  Action,
  BlockExpressionNode,
  TransactionAction,
} from "@evmcrispr/sdk";
import {
  commaListItems,
  defineCommand,
  ErrorException,
  withSender,
} from "@evmcrispr/sdk";
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
  createsBatchContext: true,
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

    // The last forwarder in the chain is what the targets see as
    // msg.sender: `@sender` inside the block.
    const blockActions = (await withSender(
      module,
      forwarderAppAddresses[forwarderAppAddresses.length - 1],
      () =>
        interpretNode(block as BlockExpressionNode, {
          // Inherit hasActions from any enclosing batch context: reads inside
          // this block can't see the outer batch's actions either.
          batchContext: {
            name: "forward",
            hasActions: interpreters.batchContext?.hasActions ?? false,
          },
        }),
    )) as Action[];

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
