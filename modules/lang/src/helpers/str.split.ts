import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  constIntArg,
  lensedDataOperand,
  requireBytesLike,
  splitParam,
} from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.split",
  description:
    "Split a string by a delimiter into an array of strings, or select one segment when an index is given. As @str.split! the string return of a call is split on-chain and the indexed segment selected (the index is required there).",
  returnType: ["array", "string"],
  args: [
    {
      name: "s",
      type: "string",
      description:
        "Source string (in @str.split! a `::` call expression or chain returning a string)",
    },
    {
      name: "delim",
      type: "string",
      description: "Exact, non-empty delimiter byte sequence",
    },
    {
      name: "index",
      type: "number",
      optional: true,
      description:
        "Segment to select instead of the whole array: zero-based from the start, or negative from the end (-1 = last, -2 = second-last, …). Required in @str.split!",
    },
  ],
  async run(_, { s, delim, index }) {
    const parts = String(s).split(String(delim));
    if (index === undefined) return parts;
    const i = Number(index);
    const at = i < 0 ? parts.length + i : i;
    if (!Number.isInteger(i) || at < 0 || at >= parts.length) {
      throw new ErrorException(
        `@str.split index ${index} is out of range for ${parts.length} segments`,
      );
    }
    return parts[at];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        "@str.split! expects (call delimiter index), e.g. @str.split!($pool::name() ` ` 1) — segment indexes count from the start (0, 1, …) or from the end (-1, -2, …)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.split!", node.args[0]);
    requireBytesLike(arg, "str.split!");
    const delimiter = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof delimiter !== "string" || delimiter.length === 0) {
      throw new ErrorException(
        "@str.split! delimiter must be a non-empty string",
      );
    }
    const index = await constIntArg(ctx, "str.split!", "index", node.args[2]);
    return {
      kind: "call",
      param: splitParam(
        ctx,
        lensedDataOperand(ctx, arg),
        stringToHex(delimiter),
        index,
      ),
      cat: "String",
    };
  },
});
