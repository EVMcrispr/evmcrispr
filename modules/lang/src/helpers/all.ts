import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  compilePredicateTemplate,
  FOLD_EXIT,
  foldParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "all",
  description: "Whether every element satisfies the predicate.",
  compileDescription:
    "The predicate must be an Operators-backed helper reducing to one call, e.g. `@bool!(> 0)`, with the element prepended to its arguments.",
  returnType: "bool",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
    {
      name: "fn",
      type: "helper",
      description: "Predicate helper returning bool",
    },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result !== true && result !== "true") {
        return "false";
      }
    }
    return "true";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@all! expects (call predicate), e.g. @all!($vault::caps() @bool!(>= 100))",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "all!");
    const tpl = await compilePredicateTemplate(
      ctx,
      node.args[1],
      "@all!",
      categoryFromAbiType(elemType),
    );
    // All-exit fold with init 1: the accumulator stays 1 exactly while
    // every element passes; the predicate ignores the accumulator, so
    // both fold windows share the element offset (element wins on
    // overlap).
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        tpl.template,
        tpl.elemOffset,
        tpl.elemOffset,
        1n,
        FOLD_EXIT.All,
      ),
      cat: "Bool",
    };
  },
});
