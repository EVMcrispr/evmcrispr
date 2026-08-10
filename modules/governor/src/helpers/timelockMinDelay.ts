import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Governor from "..";
import { timelockAbi } from "../utils";

export default defineHelper<Governor>({
  name: "timelockMinDelay",
  batchable: false,
  description:
    "Minimum delay in seconds a TimelockController enforces on new operations.",
  returnType: "number",
  args: [
    {
      name: "timelock",
      type: "address",
      description: "TimelockController address",
    },
  ],
  async run(module, { timelock }) {
    const client = await module.getClient();
    const minDelay = await client.readContract({
      address: timelock,
      abi: timelockAbi,
      functionName: "getMinDelay",
    });
    return Num.fromBigInt(minDelay);
  },
  compile: async (ctx, node) => {
    const timelock = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    return callReadOperand(
      ctx,
      timelock,
      getAbiItem({ abi: timelockAbi, name: "getMinDelay" }) as AbiFunction,
      [],
      "Uint",
    );
  },
});
