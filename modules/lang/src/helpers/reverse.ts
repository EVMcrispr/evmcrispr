import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { OP_SELECTORS, opReadParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "reverse",
  description:
    "Return a new array with elements in reverse order. As @reverse! the array return of a call reversed on-chain through reverseWords — the result is the reversed words payload, composable with the other array faces.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    return [...arr].reverse();
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@reverse! expects a single array argument, e.g. @reverse!($safe::getOwners())",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "reverse!");
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.reverseWords, [payload]),
      cat: "Bytes",
    };
  },
});
