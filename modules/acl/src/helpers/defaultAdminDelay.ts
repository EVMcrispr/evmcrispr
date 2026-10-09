import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type AccessControl from "..";
import { defaultAdminRulesAbi } from "../utils";

export default defineHelper<AccessControl>({
  name: "defaultAdminDelay",
  batchable: false,
  description:
    "Delay in seconds applied to default admin transfers of an AccessControlDefaultAdminRules contract.",
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
  compile: async (ctx, node) =>
    callReadOperand(
      ctx,
      await readTarget(ctx, "defaultAdminDelay!", node.args[0]),
      getAbiItem({
        abi: defaultAdminRulesAbi,
        name: "defaultAdminDelay",
      }) as AbiFunction,
      [],
      "Uint",
    ),
});
