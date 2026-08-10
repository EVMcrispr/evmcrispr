import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  categoryFromAbiType,
  compilePredicateTemplate,
  filterWordsParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "filter",
  description: "Keep elements of an array for which a helper returns truthy.",
  compileDescription:
    "The predicate is an Operators-backed helper, e.g. `@bool!(>= 100)`, with the element prepended to its arguments; a composed predicate costs more per element.",
  returnType: "array",
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
    const results = [];
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        results.push(item);
      }
    }
    return results;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@filter! expects (call predicate), e.g. @filter!($vault::caps() @bool!(>= 100))",
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "filter!");
    const tpl = await compilePredicateTemplate(
      ctx,
      node.args[1],
      "@filter!",
      categoryFromAbiType(elemType),
    );
    return {
      kind: "call",
      param: filterWordsParam(
        ctx,
        payload,
        tpl.target,
        tpl.template,
        [tpl.elemOffset],
      ),
      cat: "Bytes",
    };
  },
});
