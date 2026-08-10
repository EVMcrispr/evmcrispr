import { defineHelper } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { GUARD_STORAGE_SLOT } from "../addresses";
import { getGuard, safeAbi } from "../utils";

export default defineHelper<Safe>({
  name: "guard",
  description:
    "Transaction guard address of a Safe (the zero address when no guard is set).",
  returnType: "address",
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
    return getGuard(await module.getClient(), await module.resolveSafe(safe));
  },
  compile: async (ctx, node) => {
    const explicit = node.args[0]
      ? String(await ctx.interpreters.interpretNode(node.args[0]))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    // getStorageAt(slot, 1) returns bytes [0x20][32][slot word]: the
    // guard address word is word 2 of the envelope.
    return directReadOperand(
      ctx,
      safe,
      encodeFunctionData({
        abi: safeAbi,
        functionName: "getStorageAt",
        args: [BigInt(GUARD_STORAGE_SLOT), 1n],
      }),
      "Address",
      2n,
    );
  },
});
