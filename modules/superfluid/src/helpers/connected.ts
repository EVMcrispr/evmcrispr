import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { gdaForwarderAbi } from "../abis";
import { GDA_FORWARDER } from "../addresses";

export default defineHelper<Superfluid>({
  name: "connected",
  batchable: false,
  description:
    "Whether a member is connected to a GDA pool (connected members see pool earnings in their balance automatically).",
  returnType: "bool",
  args: [
    { name: "pool", type: "address", description: "GDA pool address" },
    { name: "member", type: "address", description: "Pool member" },
  ],
  async run(module, { pool, member }) {
    const client = await module.getClient();
    return (await client.readContract({
      address: GDA_FORWARDER,
      abi: gdaForwarderAbi as Abi,
      functionName: "isMemberConnected",
      args: [pool, member],
    })) as boolean;
  },
  compile: async (ctx, node) => {
    // Both operands travel as calldata to the forwarder, so either may be
    // a live value: the pool is not the staticcall target here.
    return callReadOperand(
      ctx,
      GDA_FORWARDER,
      getAbiItem({
        abi: gdaForwarderAbi,
        name: "isMemberConnected",
      }) as AbiFunction,
      [node.args[0], node.args[1]],
      "Bool",
    );
  },
});
