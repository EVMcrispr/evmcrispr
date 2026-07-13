import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";

export default defineHelper<Superfluid>({
  name: "memberFlowrate",
  batchable: false,
  description:
    "The slice of a GDA pool's distribution flow currently streaming to a member, in wei per second.",
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
});
