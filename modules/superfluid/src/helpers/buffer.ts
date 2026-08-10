import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { cfaForwarderAbi } from "../abis";
import { cfaForwarder } from "../addresses";
import { compileSuperToken } from "../utils/onchain";
import { requireCore } from "../utils/protocol";
import { parseFlowRate } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "buffer",
  batchable: false,
  description:
    "Buffer deposit locked when opening a stream at the given flow rate (typically a few hours of streaming; Ethereum mainnet enforces per-token minimums).",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
    {
      name: "flowrate",
      type: "number",
      description: "Flow rate in wei per second, e.g. 1000e18/mo",
    },
  ],
  async run(module, { token, flowrate }) {
    const chainId = await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const rate = parseFlowRate(flowrate, "<flowrate>");
    const client = await module.getClient();
    const buffer = (await client.readContract({
      address: cfaForwarder(chainId),
      abi: cfaForwarderAbi as Abi,
      functionName: "getBufferAmountByFlowrate",
      args: [superToken, rate],
    })) as bigint;
    return Num.fromBigInt(buffer);
  },
  compile: async (ctx, node) => {
    const chainId = await requireCore(ctx.module);
    const superToken = await compileSuperToken(ctx, node.args[0], "@buffer!");
    // Rate literals (`1000e18/mo`) are exact rationals floored to
    // wei/second by the parser, so the rate is a composition-time value
    // even here; only the deposit computation defers to assertion time.
    const rate = parseFlowRate(
      await ctx.interpreters.interpretNode(node.args[1]),
      "<flowrate>",
    );
    return callReadOperand(
      ctx,
      cfaForwarder(chainId),
      getAbiItem({
        abi: cfaForwarderAbi,
        name: "getBufferAmountByFlowrate",
      }) as AbiFunction,
      [{ value: superToken }, { value: rate }],
      "Uint",
    );
  },
});
