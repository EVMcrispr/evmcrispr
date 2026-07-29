import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";

export default defineHelper<Superfluid>({
  name: "units",
  batchable: false,
  description: "A member's share units in a GDA pool.",
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
});
