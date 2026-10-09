import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "defaultAdmin",
  batchable: false,
  description:
    "Current default admin of an AccessControlDefaultAdminRules contract.",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "defaultAdmin!", node.args[0]),
      getAbiItem({
        abi: defaultAdminRulesAbi,
        name: "defaultAdmin",
      }) as AbiFunction,
      [],
      "Address",
    ),
});
