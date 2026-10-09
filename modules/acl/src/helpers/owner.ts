import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type AccessControl from "..";
import { ownableAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "owner",
  batchable: false,
  description: "Current owner of an Ownable contract.",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "owner!", node.args[0]),
      getAbiItem({ abi: ownableAbi, name: "owner" }) as AbiFunction,
      [],
      "Address",
    ),
});
