import { defineHelper } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { ethRegistrarMap, requireAddress } from "../addresses";
import { ethRegistrarAbi } from "../ethRegistrar";
import { onchainAddress } from "../onchain";
import { eth2LDLabel, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "available",
  batchable: false,
  description:
    "Check whether a .eth name is available for registration (ENSv2's ETHRegistrar, which counts names still on ENS v1 as taken).",
  compileDescription:
    "Mainnet only: an assertion reads the chain it runs on, and ENS cannot be reached from another chain.",
  returnType: "bool",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name or label (e.g. vitalik.eth or vitalik)",
    },
  ],
  async run(module, { name }) {
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const client = mainnetClient(module);
    return client.readContract({
      address: requireAddress(ethRegistrarMap, mainnet.id, "ETHRegistrar"),
      abi: ethRegistrarAbi,
      functionName: "isAvailable",
      args: [label],
    });
  },
  compile: async (ctx, node): Promise<Operand> => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const registrar = await onchainAddress(
      ctx,
      ethRegistrarMap,
      "ETHRegistrar",
    );
    return {
      kind: "call",
      param: staticCallParam(
        registrar,
        encodeFunctionData({
          abi: ethRegistrarAbi,
          functionName: "isAvailable",
          args: [label],
        }),
      ),
      cat: "Bool",
    };
  },
});
