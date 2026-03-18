import {
  defineCommand,
  encodeAction,
  fieldItem,
  parseSignatureParamTypes,
} from "@evmcrispr/sdk";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

export default defineCommand<AragonOS>({
  name: "act",
  description:
    "Execute an action on a target contract through an agent or vault.",
  args: [
    { name: "agent", type: "address" },
    { name: "target", type: "address", description: "Target contract address" },
    { name: "signature", type: "write-abi", description: "Function signature to call" },
    {
      name: "params",
      type: "any", description: "Function arguments",
      rest: true,
      resolveType: (ctx) => {
        const sigNode = ctx.nodeArgs[2];
        if (!sigNode?.value) return "any";
        const paramTypes = parseSignatureParamTypes(sigNode.value);
        const paramIndex = ctx.argIndex - 3;
        return paramTypes[paramIndex] ?? "any";
      },
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
