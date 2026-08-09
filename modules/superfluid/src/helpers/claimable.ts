import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { superfluidPoolAbi } from "../abis";
import { compileTarget } from "../utils/onchain";

export default defineHelper<Superfluid>({
  name: "claimable",
  batchable: false,
  description:
    "Amount a member can claim from a GDA pool right now (accrued earnings not yet reflected in their balance). As @claimable! the getClaimableNow() read happens on-chain at assertion time, against the timestamp of the block that executes the batch (the pool still resolves at composition time).",
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
  compile: async (ctx, node) => {
    const pool = await compileTarget(ctx, node.args[0]);
    // getClaimableNow returns (int256 claimableBalance, uint256 timestamp);
    // word 0 is picked so the operand stays a single word when it nests.
    return callReadOperand(
      ctx,
      pool,
      getAbiItem({
        abi: superfluidPoolAbi,
        name: "getClaimableNow",
      }) as AbiFunction,
      [node.args[1]],
      "Int",
      0n,
    );
  },
});
