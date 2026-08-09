import { defineHelper } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type AccessControl from "..";
import { ownableAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "owner",
  batchable: false,
  description:
    "Current owner of an Ownable contract. As @owner! the owner() read happens on-chain at assertion time.",
  returnType: "address",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Ownable contract address",
    },
  ],
  async run(module, { contract }) {
    const client = await module.getClient();
    return client.readContract({
      address: contract,
      abi: ownableAbi,
      functionName: "owner",
    });
  },
  compile: async (ctx, node) => {
    const contract = await ctx.interpreters.interpretNode(node.args[0]);
    return directReadOperand(
      ctx,
      getAddress(String(contract)),
      encodeFunctionData({ abi: ownableAbi, functionName: "owner" }),
      "Address",
    );
  },
});
