import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { registryMap, requireAddress } from "../addresses";
import { onchainRegistry } from "../onchain";
import { getNode, mainnetClient, registryAbi } from "../utils";

export default defineHelper<Ens>({
  name: "resolver",
  batchable: false,
  description: "Resolver contract address of an ENS name.",
  compileDescription:
    "Mainnet only, since an assertion reads the chain it runs on, and a name with no resolver reads as the zero address.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  // The resolver the name has in the ENS registry, as the on-chain face
  // reads it. The Universal Resolver no longer names it: since ENS v2 it
  // answers its v1 bridge (ENSV1Resolver) for every v1 name, a contract
  // that only resolves through ENSIP-10 and that a record is not set on.
  async run(module, { name }, { node }) {
    const resolver = await mainnetClient(module).readContract({
      address: requireAddress(registryMap, mainnet.id, "registry"),
      abi: registryAbi,
      functionName: "resolver",
      args: [getNode(name)],
    });
    if (resolver === zeroAddress) {
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
