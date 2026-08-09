import { defineHelper, Num } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "defaultAdminDelay",
  batchable: false,
  description:
    "Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract. As @defaultAdminDelay! the read happens on-chain at assertion time.",
  returnType: "number",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    const delay = await client.readContract({
      address: contract,
      abi: defaultAdminRulesAbi,
      functionName: "defaultAdminDelay",
    });
    return Num.fromBigInt(BigInt(delay));
  },
  compile: async (ctx, node) => {
    const contract = await ctx.interpreters.interpretNode(node.args[0]);
    return directReadOperand(
      ctx,
      getAddress(String(contract)),
      encodeFunctionData({
        abi: defaultAdminRulesAbi,
        functionName: "defaultAdminDelay",
      }),
      "Uint",
    );
  },
});
