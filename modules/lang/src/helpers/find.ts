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
    "First element that satisfies the predicate; no match is an error.",
  compileDescription:
    "The predicate is a named `def @name!` of one parameter returning bool, applied by name.",
  returnType: "any",
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
      if (result === true || result === "true") {
        return item;
      }
    }
    throw new ErrorException("@find: no element matched the predicate");
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@find! expects (call predicate), e.g. @find!($vault::caps() @ge100!) with def @ge100! "$x: number -> bool" @bool!($x >= 100)',
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
          filterWordsParam(
            ctx,
            payload,
            tpl.target,
            tpl.template,
            tpl.elemOffsets,
          ),
          2n,
        ),
      ),
      cat: categoryFromAbiType(elemType),
    };
  },
});
