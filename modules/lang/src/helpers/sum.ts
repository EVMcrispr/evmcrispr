import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { sumWordsParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "sum",
  description:
    "Sum the elements of an array. As @sum! a native `sumWords` over the array return of a call: the checked sum of its single-word elements. It is the fixed-operation sibling of @reduce! (use `@reduce!(add 0)` for any other reduction).",
  returnType: "number",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @sum! a `::` call expression or chain returning an array of single-word elements, or a nested array face)",
    },
  ],
  async run(_, { arr }) {
    let acc = Num(0n);
    for (const item of arr) {
      acc = acc.add(item instanceof Num ? item : Num(item as never));
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
