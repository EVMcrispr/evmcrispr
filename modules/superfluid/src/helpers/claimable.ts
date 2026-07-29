import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";

export default defineHelper<Superfluid>({
  name: "claimable",
  batchable: false,
  description:
    "Amount a member can claim from a GDA pool right now (accrued earnings not yet reflected in their balance).",
  returnType: "number",
  args: [
    { name: "pool", type: "address", description: "GDA pool address" },
    { name: "member", type: "address", description: "Pool member" },
  ],
  async run(module, { pool, member }) {
    const client = await module.getClient();
    const [claimable] = (await client.readContract({
      address: pool,
      abi: superfluidPoolAbi as Abi,
      functionName: "getClaimableNow",
      args: [member],
    })) as [bigint, bigint];
    return Num.fromBigInt(claimable);
  },
});
