import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  replaceParam,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.replace",
  description:
    "Replace all occurrences of a substring. As @str.replace! the string return of a call is rewritten on-chain — every non-overlapping left-to-right match of the exact byte sequence.",
  returnType: "string",
  args: [
    {
      name: "s",
      type: "string",
      description:
        "Source string (in @str.replace! a `::` call expression or chain returning a string)",
    },
    {
      name: "old",
      type: "string",
      description: "Substring to match (non-empty in @str.replace!)",
    },
    { name: "replacement", type: "string", description: "Replacement text" },
  ],
  async run(_, { s, old, replacement }) {
    return String(s).replaceAll(String(old), String(replacement));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        '@str.replace! expects (call old new), e.g. @str.replace!($pool::name() "LP" "Pool")',
      );
    }
    const arg = await chainArgWithLens(ctx, "str.replace!", node.args[0]);
    requireBytesLike(arg, "str.replace!");
    const old = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof old !== "string" || old.length === 0) {
      throw new ErrorException(
        "@str.replace! needle must be a non-empty string (the on-chain replace rejects an empty needle)",
      );
    }
    const replacement = await ctx.interpreters.interpretNode(node.args[2]);
    if (typeof replacement !== "string") {
      throw new ErrorException("@str.replace! replacement must be a string");
    }
    return {
      kind: "call",
      param: replaceParam(
        ctx,
        lensedDataOperand(ctx, arg),
        stringToHex(old),
        stringToHex(replacement),
      ),
      cat: "String",
    };
  },
});
