import type { Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { constIntArg, unzipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "unzip",
  description: "Transpose an array of pairs into two separate arrays.",
  compileDescription:
    "The `lane` argument defaults to 0 (`@keys!` is lane 0 and `@values!` lane 1), and an odd word count gives lane 0 the extra word.",
  returnType: "array",
  args: [
    { name: "pairs", type: "array", description: "Array of [a, b] pairs" },
    {
      name: "lane",
      type: "number",
      optional: true,
      description: "Which lane to keep: 0 (first of each pair) or 1 (second)",
    },
  ],
  async run(_, { pairs }) {
    const firsts: Param[] = [];
    const seconds: Param[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new ErrorException(
          `@unzip: element at index ${i} is not a two-element array`,
        );
      }
      firsts.push(pair[0]);
      seconds.push(pair[1]);
    }
    return [firsts, seconds];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1 && node.args.length !== 2) {
      throw new ErrorException(
        "@unzip! expects (call lane?) with lane 0 or 1, e.g. @unzip!($amm::reservePairs() 0)",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "unzip!");
    /** An omitted lane keeps lane 0, the same half `@keys!` selects. */
    const which =
      node.args.length === 2
        ? await constIntArg(ctx, "unzip!", "lane", node.args[1])
        : 0n;
    if (which !== 0n && which !== 1n) {
      throw new ErrorException("@unzip! lane must be 0 or 1");
    }
    return {
      kind: "call",
      param: unzipParam(ctx, payload, which),
      cat: "Bytes",
    };
  },
});
