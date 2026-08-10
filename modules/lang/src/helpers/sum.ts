import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
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
