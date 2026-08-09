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
  name: "any",
  description:
    "Return true if at least one element satisfies the predicate. As @any! a foldWords over the array return of a call with the Any exit — the predicate names an Operators-backed helper (e.g. `@bool!(> 0)`, the element prepended to its arguments) compiled into a single-call lambda template.",
  returnType: "bool",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @any! a `::` call expression or chain returning an array of single-word elements)",
    },
    {
      name: "fn",
      type: "helper",
      description:
        "Predicate helper returning bool (in @any! an Operators-backed single-call predicate, e.g. `@bool!(== 0)`)",
    },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        return "true";
      }
    }
    return "false";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@any! expects (call predicate), e.g. @any!($vault::caps() @bool!(== 0))",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "any!");
    const tpl = await compilePredicateTemplate(
      ctx,
      node.args[1],
      "@any!",
      categoryFromAbiType(elemType),
    );
    // Any-exit fold with init 0: the accumulator becomes 1 on the first
    // passing element; the predicate ignores the accumulator, so both
    // fold windows share the element offset (element wins on overlap).
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        tpl.template,
        tpl.elemOffset,
        tpl.elemOffset,
        0n,
        FOLD_EXIT.Any,
      ),
      cat: "Bool",
    };
  },
});
