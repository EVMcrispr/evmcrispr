import { defineHelper, Num } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { getThreshold, safeAbi } from "../utils";
import { safeReadParam } from "../utils/onchain";

export default defineHelper<Safe>({
  name: "threshold",
  description: "Signature threshold of a Safe.",
  returnType: "number",
  batchable: false,
  args: [
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
  ],
  async run(module, { safe }) {
    return Num.fromBigInt(
      await getThreshold(
        await module.getClient(),
        await module.resolveSafe(safe),
      ),
    );
  },
  compile: async (ctx, node) => {
    const param = await safeReadParam(
      ctx,
      "threshold!",
      node.args[0],
      encodeFunctionData({ abi: safeAbi, functionName: "getThreshold" }),
    );
    return { kind: "call", param, cat: "Uint" };
  },
});
