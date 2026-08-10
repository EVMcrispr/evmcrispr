import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  replaceParam,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { stringArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "str.replace",
  description:
    "Replace all occurrences of a substring (every non-overlapping left-to-right match).",
  compileDescription:
    "The needle and replacement may be live calls; a constant needle must be non-empty, and an empty live one reverts.",
  returnType: "string",
  args: [
    {
      name: "s",
      type: "string",
      description: "Source string",
    },
    {
      name: "old",
      type: "string",
      description: "Substring to match",
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
    const { part: old, text: oldText } = await stringArg(
      ctx,
      node.args[1],
      "str.replace!",
      "needle",
    );
    if (oldText !== undefined && oldText.length === 0) {
      throw new ErrorException(
        "@str.replace! needle must be a non-empty string (the on-chain replace rejects an empty needle)",
      );
    }
    const { part: replacement } = await stringArg(
      ctx,
      node.args[2],
      "str.replace!",
      "replacement",
    );
    return {
      kind: "call",
      param: replaceParam(ctx, lensedDataOperand(ctx, arg), old, replacement),
      cat: "String",
    };
  },
});
