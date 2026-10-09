import { defineHelper } from "@evmcrispr/sdk";
import { arrayWordsParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { getOwners, safeAbi } from "../utils";
import { safeReadParam } from "../utils/onchain";

export default defineHelper<Safe>({
  name: "owners",
  description: "Owner addresses of a Safe.",
  returnType: "array",
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
    return getOwners(await module.getClient(), await module.resolveSafe(safe));
  },
  compile: async (ctx, node) => {
    const param = await safeReadParam(
      ctx,
      "owners!",
      node.args[0],
      encodeFunctionData({ abi: safeAbi, functionName: "getOwners" }),
    );
    // The array-face representation: the getOwners() envelope re-framed
    // as its live words payload (count via a LEN-sentinel nav), so the
    // operand nests into the lang array faces like any nested array face.
    return {
      kind: "call",
      param: arrayWordsParam(ctx, param, "address"),
      cat: "Bytes",
      collection: { element: { type: "address" }, transport: "words" },
    };
  },
});
