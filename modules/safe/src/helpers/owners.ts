import { defineHelper } from "@evmcrispr/sdk";
import {
  arrayWordsParam,
  lenParam,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import type Safe from "..";
import { getOwners, safeAbi } from "../utils";

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
    const explicit = node.args[0]
      ? String(await ctx.interpreters.interpretNode(node.args[0]))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    const param = staticCallParam(
      safe,
      encodeFunctionData({ abi: safeAbi, functionName: "getOwners" }),
    );
    const outputs = [{ type: "address[]" }] as const;
    // The array-face representation: the getOwners() envelope re-framed
    // as its live words payload (count via a LEN-sentinel nav), so the
    // operand nests into the lang array faces like any nested array face.
    return {
      kind: "call",
      param: arrayWordsParam(ctx, param, lenParam(ctx, param, outputs, [0])),
      cat: "Bytes",
    };
  },
});
