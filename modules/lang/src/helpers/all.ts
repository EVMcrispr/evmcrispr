import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  chainArgWithLens,
  compilePredicateTemplate,
  FOLD_EXIT,
  foldParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordArrayPath, wordsPayload } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "all",
  description:
    "Return true if every element satisfies the predicate. As @all! a foldWords over the array return of a call with the All exit — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template.",
  returnType: "bool",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @all! a `::` call expression or chain returning an array of single-word elements)",
    },
    {
      name: "fn",
      type: "helper",
      description:
        "Predicate helper returning bool (in @all! an Operators-backed single-call predicate, e.g. `@bool!(>= 100)`)",
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
    const arg = await chainArgWithLens(ctx, "all!", node.args[0]);
    const { path, elemType } = wordArrayPath(arg, "all!");
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
        wordsPayload(ctx, arg, path),
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
