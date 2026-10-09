import { defineHelper, Num } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { getSafeNonce, safeAbi } from "../utils";
import { safeReadParam } from "../utils/onchain";

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
    const param = await safeReadParam(
      ctx,
      "nonce!",
      node.args[0],
      encodeFunctionData({ abi: safeAbi, functionName: "nonce" }),
    );
    return { kind: "call", param, cat: "Uint" };
  },
});
