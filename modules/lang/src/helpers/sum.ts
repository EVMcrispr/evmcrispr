import { asNum, defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { sumWordsParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "sum",
  description: "Sum the elements of an array.",
  returnType: "number",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
  ],
  async run(_, { arr }) {
    let acc = Num(0n);
    for (const item of arr) {
      // asNum, not Num(item): a uint256[] read arrives as bigint[], and Num
      // throws outright on a JS number rather than coercing.
      const n = asNum(item);
      if (!n) {
        throw new ErrorException(
          `@sum: every element must be numeric, got ${String(item)}`,
        );
      }
      acc = acc.add(n);
    }
    return acc;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@sum! expects a single call argument, e.g. @sum!($vault::caps())",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "sum!");
    return {
      kind: "call",
      param: sumWordsParam(ctx, payload),
      cat: "Uint",
    };
  },
});
