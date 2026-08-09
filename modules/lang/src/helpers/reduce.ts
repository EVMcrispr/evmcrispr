import type { HelperFunctionNode } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  constIntArg,
  FOLD_EXIT,
  foldParam,
  opSelector,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

/** Binary Operators lambdas a fold accumulator composes with. */
const REDUCERS = ["add", "min", "max", "bitOr", "bitAnd"] as const;

export default defineHelper<Lang>({
  name: "reduce",
  description:
    "Reduce an array to a single value by applying a helper. As @reduce! a foldWords over the array return of a call with a binary Operators lambda — add, min, max, bitOr or bitAnd — and a build-time initial accumulator.",
  returnType: "any",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @reduce! a `::` call expression or chain returning an array of single-word elements)",
    },
    {
      name: "fn",
      type: "helper",
      description:
        "Reducer helper receiving `(accumulator, element)` (in @reduce! one of `add`, `min`, `max`, `bitOr`, `bitAnd`)",
    },
    { name: "initial", type: "any", description: "Initial accumulator value" },
  ],
  async run(_, { arr, fn, initial }) {
    let acc = initial;
    for (const item of arr) {
      acc = await fn(acc, item);
    }
    return acc;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        "@reduce! expects (call fn initial), e.g. @reduce!($vault::caps() add 0)",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "reduce!");

    const fnNode = node.args[1];
    let name: string | undefined;
    if (fnNode.type === NodeType.HelperFunctionExpression) {
      name = (fnNode as HelperFunctionNode).name.replace(/!$/, "");
    } else {
      const value = await ctx.interpreters.interpretNode(fnNode);
      if (typeof value === "string") name = value;
    }
    if (!name || !(REDUCERS as readonly string[]).includes(name)) {
      throw new ErrorException(
        `@reduce! reduces with a binary Operators lambda — one of ${REDUCERS.join(", ")} — got ${name ?? "an unsupported reducer"}`,
      );
    }
    const init = await constIntArg(ctx, "reduce!", "initial", node.args[2]);
    // <fn>(<accumulator>, <element>): accumulator window at 4, element
    // window at 36 — the canonical foldWords convention.
    const template: Hex = `0x${opSelector(name).slice(2)}${toWord(0n).slice(2)}${toWord(0n).slice(2)}`;
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        template,
        4n,
        36n,
        init,
        FOLD_EXIT.Full,
      ),
      cat: "Uint",
    };
  },
});
