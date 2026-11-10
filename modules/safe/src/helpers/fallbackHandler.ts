import { defineHelper } from "@evmcrispr/sdk";
import { encodePick, staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { FALLBACK_HANDLER_STORAGE_SLOT } from "../addresses";
import { getSlotAddress, safeAbi } from "../utils";
import { safeReadParam } from "../utils/onchain";

export default defineHelper<Safe>({
  name: "fallbackHandler",
  description:
    "Fallback handler address of a Safe, which answers the calls the Safe itself does not implement (the zero address when none is set).",
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
    return getSlotAddress(
      await module.getClient(),
      await module.resolveSafe(safe),
      FALLBACK_HANDLER_STORAGE_SLOT,
    );
  },
  compile: async (ctx, node) => {
    // getStorageAt(slot, 1) returns bytes [0x20][32][slot word]: the
    // address word is word 2 of the envelope.
    const param = await safeReadParam(
      ctx,
      "fallbackHandler!",
      node.args[0],
      encodeFunctionData({
        abi: safeAbi,
        functionName: "getStorageAt",
        args: [BigInt(FALLBACK_HANDLER_STORAGE_SLOT), 1n],
      }),
    );
    return {
      kind: "call",
      param: staticCallParam(ctx.core, encodePick(param, 2n)),
      cat: "Address",
    };
  },
});
