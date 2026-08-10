import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  includesParam,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { stringArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "str.includes",
  description:
    "Check whether a string contains a substring (exact byte sequence, case-sensitive).",
  compileDescription:
    "The substring may be a live call; a constant one must be non-empty, since every string contains the empty string.",
  returnType: "bool",
  args: [
    {
      name: "value",
      type: "string",
      description: "Source string",
    },
    {
      name: "item",
      type: "string",
      description: "Substring to search for",
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
    const { part, text } = await stringArg(
      ctx,
      node.args[1],
      "str.includes!",
      "part",
    );
    if (text !== undefined && text.length === 0) {
      throw new ErrorException(
        "@str.includes! part must be a non-empty string (every string contains the empty string)",
      );
    }
    return {
      kind: "call",
      param: includesParam(ctx, lensedDataOperand(ctx, arg), part),
      cat: "Bool",
    };
  },
});
