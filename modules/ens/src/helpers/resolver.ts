import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";
import { onchainRegistry } from "../onchain";
import { getNode, mainnetClient, registryAbi } from "../utils";

export default defineHelper<Ens>({
  name: "resolver",
  batchable: false,
  description: "Resolver contract address of an ENS name.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const resolver = await client.getEnsResolver({ name: normalize(name) });
    if (!resolver) {
      throw new HelperFunctionError(node, `no resolver found for ${name}`);
    }
    return resolver;
  },
  compile: async (ctx, node): Promise<Operand> => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    return {
      kind: "call",
      param: staticCallParam(
        await onchainRegistry(ctx),
        encodeFunctionData({
          abi: registryAbi,
          functionName: "resolver",
          args: [getNode(name)],
        }),
      ),
      cat: "Address",
    };
  },
});
