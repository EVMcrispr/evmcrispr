import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { cfaForwarderAbi } from "../abis";
import { cfaForwarder } from "../addresses";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "flow",
  batchable: false,
  description:
    "Current flow rate between a sender and a receiver, in wei per second (0 when no stream exists).",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
    { name: "sender", type: "address", description: "Stream sender" },
    { name: "receiver", type: "address", description: "Stream receiver" },
  ],
  async run(module, { token, sender, receiver }) {
    const chainId = await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const client = await module.getClient();
    const rate = (await client.readContract({
      address: cfaForwarder(chainId),
      abi: cfaForwarderAbi as Abi,
      functionName: "getFlowrate",
      args: [superToken, sender, receiver],
    })) as bigint;
    return Num.fromBigInt(rate);
  },
});
