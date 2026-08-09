import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  includesParam,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.includes",
  description:
    "Check whether a string contains a substring. As @str.includes! the string return of a call is checked on-chain — exact byte sequence, case-sensitive, no wildcards.",
  returnType: "bool",
  args: [
    {
      name: "value",
      type: "string",
      description:
        "Input value (in @str.includes! a `::` call expression or chain returning a string)",
    },
    {
      name: "item",
      type: "string",
      description: "Substring to search for (non-empty in @str.includes!)",
    },
  ],
  async run(_, { value, item }) {
    return String(value).includes(String(item)) ? "true" : "false";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@str.includes! expects (call part), e.g. @str.includes!($pool::name() "LP")',
      );
    }
    const arg = await chainArgWithLens(ctx, "str.includes!", node.args[0]);
    requireBytesLike(arg, "str.includes!");
    const part = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof part !== "string" || part.length === 0) {
      throw new ErrorException(
        "@str.includes! part must be a non-empty string (every string contains the empty string)",
      );
    }
    return {
      kind: "call",
      param: includesParam(ctx, lensedDataOperand(ctx, arg), stringToHex(part)),
      cat: "Bool",
    };
  },
});
