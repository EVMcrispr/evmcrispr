import type { Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { OP_SELECTORS, opReadParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "unique",
  description:
    "Remove duplicates from an array, preserving first-occurrence order. As @unique! an ADJACENT dedup on-chain through uniqueWords — nest @sort! for set-uniqueness: @unique!(@sort!(…)).",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    const seen = new Set<string>();
    const result: Param[] = [];
    for (const item of arr) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@unique! expects a single array argument, e.g. @unique!(@sort!($safe::getOwners()))",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "unique!");
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.uniqueWords, [payload]),
      cat: "Bytes",
    };
  },
});
