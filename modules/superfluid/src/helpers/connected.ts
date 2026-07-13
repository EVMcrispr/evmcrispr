import { defineHelper } from "@evmcrispr/sdk";
import type { Abi } from "viem";
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
});
