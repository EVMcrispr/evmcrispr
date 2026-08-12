import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { createPublicClient, encodeFunctionData, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type Ens from "..";
import { EMPTY_DYNAMIC_RETURN, resolverGatedChain } from "../onchain";
import { getNode } from "../utils";

const textAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
]);

export default defineHelper<Ens>({
  name: "text",
  batchable: false,
  description: "Read a text record from an ENS name.",
  compileDescription:
    "Mainnet only, and a missing record or a name with no resolver reads as an empty string instead of erroring.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
    {
      name: "key",
      type: "string",
      description: 'Text record key (e.g. "url", "com.twitter", "description")',
    },
  ],
  async run(module, { name, key }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const text = await client.getEnsText({ name: normalize(name), key });
    if (text === null || text === undefined) {
      throw new HelperFunctionError(
        node,
        `no text record "${key}" found for ${name}`,
      );
    }
    return text;
  },
  compile: async (ctx, node) => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const key = String(await ctx.interpreters.interpretNode(node.args[1]));
    const ensNode = getNode(name);
    return resolverGatedChain(
      ctx,
      ensNode,
      encodeFunctionData({
        abi: textAbi,
        functionName: "text",
        args: [ensNode, key],
      }),
      EMPTY_DYNAMIC_RETURN,
      "String",
    );
  },
});
