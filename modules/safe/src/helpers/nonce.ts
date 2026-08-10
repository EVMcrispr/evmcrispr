import { defineHelper, Num } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { getSafeNonce, safeAbi } from "../utils";

export default defineHelper<Safe>({
  name: "nonce",
  description: "Current nonce of a Safe.",
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
      await getSafeNonce(
        await module.getClient(),
        await module.resolveSafe(safe),
      ),
    );
  },
  compile: async (ctx, node) => {
    const explicit = node.args[0]
      ? String(await ctx.interpreters.interpretNode(node.args[0]))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    return directReadOperand(
      ctx,
      safe,
      encodeFunctionData({ abi: safeAbi, functionName: "nonce" }),
      "Uint",
    );
  },
});
