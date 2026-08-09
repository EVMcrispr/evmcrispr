import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  OP_SELECTORS,
  opReadParam,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.lower",
  description:
    "Convert a string to lowercase. As @str.lower! the string return of a call is case-mapped on-chain — ASCII letters only, every other byte passes verbatim (UTF-8 safe).",
  returnType: "string",
  args: [
    {
      name: "s",
      type: "string",
      description:
        "Source string (in @str.lower! a `::` call expression or chain returning a string)",
    },
  ],
  async run(_, { s }) {
    return String(s).toLowerCase();
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@str.lower! expects a single call argument, e.g. @str.lower!($pool::symbol())",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.lower!", node.args[0]);
    requireBytesLike(arg, "str.lower!");
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.toLower, [
        lensedDataOperand(ctx, arg),
      ]),
      cat: "String",
    };
  },
});
