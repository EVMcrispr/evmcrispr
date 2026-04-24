import { defineCommand, encodeAction, fieldItem } from "@evmcrispr/sdk";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

export default defineCommand<AragonOS>({
  name: "act",
  description:
    "Execute an action on a target contract through an agent or vault.",
  args: [
    {
      name: "agent",
      type: "address",
      description: "Agent or vault forwarder address",
    },
    { name: "target", type: "address", description: "Target contract address" },
    {
      name: "signature",
      type: "write-abi",
      description: "Function signature to call",
    },
    {
      name: "params",
      type: "any",
      description: "Function arguments",
      rest: true,
    },
  ],
  completions: {
    agent: (ctx) =>
      getDAOAppIdentifiers(ctx.bindings)
        .filter((id) => id.includes("agent"))
        .map(fieldItem),
  },
  async run(module, { agent, target, signature, params }) {
    const execAction = encodeAction(target, signature, params);
    return batchForwarderActions(module, [execAction], [agent]);
  },
});
