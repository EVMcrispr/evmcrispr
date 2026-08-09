import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  compilePredicateTemplate,
  encodePick,
  filterWordsParam,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "find",
  description:
    "Return the first element that satisfies the predicate. As @find! the first word of the filterWords output — a core pick over the kept payload — so a live filter with no match REVERTS the assertion (the off-chain @find raises the same no-match error at run time).",
  returnType: "any",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @find! a `::` call expression or chain returning an array of single-word elements, or a nested array face)",
    },
    {
      name: "fn",
      type: "helper",
      description:
        "Predicate helper returning bool (in @find! an Operators-backed single-call predicate, e.g. `@bool!(>= 100)`)",
    },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        return item;
      }
    }
    throw new ErrorException("@find: no element matched the predicate");
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@find! expects (call predicate), e.g. @find!($vault::caps() @bool!(>= 100))",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "find!");
    const tpl = await compilePredicateTemplate(
      ctx,
      node.args[1],
      "@find!",
      categoryFromAbiType(elemType),
    );
    // The first ELEMENT of the kept payload: filterWords keeps matching
    // words in order, and a core pick of word 2 unwraps the first one
    // from the [0x20][len][words…] envelope. An empty filter result
    // leaves word 2 out of bounds, so no match reverts at assertion time
    // — the on-chain shape of the off-chain "no element matched" error.
    return {
      kind: "call",
      param: staticCallParam(
        ctx.core,
        encodePick(
          filterWordsParam(ctx, payload, tpl.template, tpl.elemOffset),
          2n,
        ),
      ),
      cat: categoryFromAbiType(elemType),
    };
  },
});
