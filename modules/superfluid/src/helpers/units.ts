import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";
import { compileTarget } from "../utils/onchain";

export default defineHelper<Superfluid>({
  name: "units",
  batchable: false,
  description:
    "Share units a member holds in a GDA pool. As @units! the getUnits() read happens on-chain at assertion time (the pool still resolves at composition time).",
  returnType: "number",
  args: [
    { name: "pool", type: "address", description: "GDA pool address" },
    { name: "member", type: "address", description: "Pool member" },
  ],
  async run(module, { pool, member }) {
    const client = await module.getClient();
    const units = (await client.readContract({
      address: pool,
      abi: superfluidPoolAbi as Abi,
      functionName: "getUnits",
      args: [member],
    })) as bigint;
    return Num.fromBigInt(units);
  },
  compile: async (ctx, node) => {
    const pool = await compileTarget(ctx, node.args[0]);
    return callReadOperand(
      ctx,
      pool,
      getAbiItem({ abi: superfluidPoolAbi, name: "getUnits" }) as AbiFunction,
      [node.args[1]],
      "Uint",
    );
  },
});
