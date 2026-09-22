import { defineCommand, encodeAction, fieldItem } from "@evmcrispr/sdk";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

export default defineCommand<AragonOS>({
  smartSupport: { kind: "runtime" },
  name: "act",
  description:
    "Execute an action on a target contract through an agent or vault.",
  args: [
    {
      name: "agent",
      type: "address",
      description:
        "Agent or vault forwarder address (build-time protocol discovery)",
    },
    {
      name: "target",
      type: "address",
      runtime: true,
      description: "Target contract address",
    },
    {
      name: "signature",
      type: "write-abi",
      description: "Function signature to call",
    },
    {
      name: "params",
      type: "any",
      runtime: true,
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
