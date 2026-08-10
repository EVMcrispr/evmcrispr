import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";
import { compileTarget } from "../utils/onchain";

export default defineHelper<Superfluid>({
  name: "memberFlowrate",
  batchable: false,
  description:
    "The slice of the distribution flow of a GDA pool currently streaming to a member, in wei per second.",
  returnType: "number",
  args: [
    { name: "pool", type: "address", description: "GDA pool address" },
    { name: "member", type: "address", description: "Pool member" },
  ],
  async run(module, { pool, member }) {
    const client = await module.getClient();
    const rate = (await client.readContract({
      address: pool,
      abi: superfluidPoolAbi as Abi,
      functionName: "getMemberFlowRate",
      args: [member],
    })) as bigint;
    return Num.fromBigInt(rate);
  },
  compile: async (ctx, node) => {
    const pool = await compileTarget(ctx, node.args[0]);
    return callReadOperand(
      ctx,
      pool,
      getAbiItem({
        abi: superfluidPoolAbi,
        name: "getMemberFlowRate",
      }) as AbiFunction,
      [node.args[1]],
      "Int",
    );
  },
});
