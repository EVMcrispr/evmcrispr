import { defineHelper } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "defaultAdmin",
  batchable: false,
  description:
    "Current default admin of an AccessControlDefaultAdminRules contract. As @defaultAdmin! the defaultAdmin() read happens on-chain at assertion time.",
  returnType: "address",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    return client.readContract({
      address: contract,
      abi: defaultAdminRulesAbi,
      functionName: "defaultAdmin",
    });
  },
  compile: async (ctx, node) => {
    const contract = await ctx.interpreters.interpretNode(node.args[0]);
    return directReadOperand(
      ctx,
      getAddress(String(contract)),
      encodeFunctionData({
        abi: defaultAdminRulesAbi,
        functionName: "defaultAdmin",
      }),
      "Address",
    );
  },
});
