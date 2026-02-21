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
  args: [
    { name: "agent", type: "address" },
    { name: "target", type: "address" },
    { name: "signature", type: "write-abi" },
    {
      name: "params",
      type: "any",
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
