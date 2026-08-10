import { defineHelper, Num } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi } from "viem";
import { encodeFunctionData } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";
import { compileTarget } from "../utils/onchain";

export default defineHelper<Superfluid>({
  name: "totalUnits",
  batchable: false,
  description: "Total units across all members of a GDA pool.",
  returnType: "number",
  args: [{ name: "pool", type: "address", description: "GDA pool address" }],
  async run(module, { pool }) {
    const client = await module.getClient();
    const units = (await client.readContract({
      address: pool,
      abi: superfluidPoolAbi as Abi,
      functionName: "getTotalUnits",
    })) as bigint;
    return Num.fromBigInt(units);
  },
  compile: async (ctx, node) => {
    return directReadOperand(
      ctx,
      await compileTarget(ctx, node.args[0]),
      encodeFunctionData({
        abi: superfluidPoolAbi,
        functionName: "getTotalUnits",
      }),
      "Uint",
    );
  },
});
