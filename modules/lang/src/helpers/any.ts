import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  categoryFromAbiType,
  collectionReadParam,
  compileCollectionCallback,
  compilePredicateTemplate,
  FOLD_EXIT,
  foldParam,
  formatParamType,
  lookupOnchainDef,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { arrayArg } from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "any",
  description: "Whether at least one element satisfies the predicate.",
  compileDescription:
    "Predicates return bool and stop at the first decisive result. Supports typed dynamic arrays and word-specialized predicates.",
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
      if (result === true || result === "true") {
        return "true";
      }
    }
    return "false";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@any! expects (call predicate), e.g. @any!($vault::caps() @isZero!) with def @isZero! "$x: number -> bool" @bool!($x == 0)',
      );
    }
    const array = await arrayArg(ctx, node.args[0], "any!");
    const def =
      node.args[1].type === NodeType.HelperFunctionExpression
        ? lookupOnchainDef(ctx, node.args[1].name)
        : undefined;
    if (!array.words || def?.bodyNode.type === NodeType.CallExpression) {
      const { callbackSpec, output } = await compileCollectionCallback(
        ctx,
        node.args[1],
        [array.element],
      );
      if (output.type !== "bool")
        throw new ErrorException("@any! predicate must return bool");
      return {
        kind: "call",
        cat: "Bool",
        param: collectionReadParam(ctx, "anyValues", [
          { kind: "value", value: formatParamType(array.element) },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            arrayValuesParam(ctx, array),
          ),
          callbackSpec,
        ]),
      };
    }
    const payload = array.words!;
    const elemType = array.element.type;
    const tpl = await compilePredicateTemplate(
      ctx,
      node.args[1],
      "@any!",
      categoryFromAbiType(elemType),
    );
    // Any-exit fold with init 0: the accumulator becomes 1 on the first
    // passing element; the predicate ignores the accumulator, so acc
    // parks on the first element window (element wins on overlap).
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        tpl.target,
        tpl.template,
        tpl.elemOffsets[0],
        tpl.elemOffsets,
        0n,
        FOLD_EXIT.Any,
      ),
      cat: "Bool",
    };
  },
});
