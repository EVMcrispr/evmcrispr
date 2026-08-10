import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { gdaForwarderAbi } from "../abis";
import { GDA_FORWARDER } from "../addresses";
import { compileSuperToken } from "../utils/onchain";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "distributionFlowrate",
  batchable: false,
  description:
    "Flow rate a distributor is currently streaming into a GDA pool, in wei per second.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
    { name: "from", type: "address", description: "Distributor account" },
    { name: "pool", type: "address", description: "GDA pool address" },
  ],
  async run(module, { token, from, pool }) {
    const superToken = await resolveSuperToken(module, token);
    const client = await module.getClient();
    const rate = (await client.readContract({
      address: GDA_FORWARDER,
      abi: gdaForwarderAbi as Abi,
      functionName: "getFlowDistributionFlowRate",
      args: [superToken, from, pool],
    })) as bigint;
    return Num.fromBigInt(rate);
  },
  compile: async (ctx, node) => {
    const superToken = await compileSuperToken(
      ctx,
      node.args[0],
      "@distributionFlowrate!",
    );
    return callReadOperand(
      ctx,
      GDA_FORWARDER,
      getAbiItem({
        abi: gdaForwarderAbi,
        name: "getFlowDistributionFlowRate",
      }) as AbiFunction,
      [{ value: superToken }, node.args[1], node.args[2]],
      "Int",
    );
  },
});
