import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  categoryFromAbiType,
  collectionReadParam,
  compileCollectionCallback,
  compilePredicateTemplate,
  filterWordsParam,
  formatParamType,
  lookupOnchainDef,
  packedArrayOperand,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "filter",
  description: "Keep elements of an array for which a helper returns truthy.",
  compileDescription:
    "The predicate is a named definition returning bool. Word predicates may compose helpers; generic values require one direct ABI call.",
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
        '@filter! expects (call predicate), e.g. @filter!($vault::caps() @ge100!) with def @ge100! "$x: number -> bool" @bool!($x >= 100)',
      );
    }
    const array = await typedArrayArg(ctx, node.args[0], "filter!");
    const def =
      node.args[1]?.type === NodeType.HelperFunctionExpression
        ? lookupOnchainDef(ctx, node.args[1].name)
        : undefined;
    if (!array.words || def?.bodyNode.type === NodeType.CallExpression) {
      const { callbackSpec, output } = await compileCollectionCallback(
        ctx,
        node.args[1],
        [array.element],
      );
      if (output.type !== "bool")
        throw new ErrorException("@filter! callback must return bool");
      const values = arrayValuesParam(ctx, array);
      const result = collectionReadParam(ctx, "filterValues", [
        { kind: "value", value: formatParamType(array.element) },
        canonicalArgSpec(ctx, { type: "bytes[]" }, values),
        callbackSpec,
      ]);
      return packedArrayOperand(ctx, result, array.element);
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
        tpl.elemOffsets,
      ),
      cat: "Bytes",
      collection: { element: array.element, transport: "words" },
    };
  },
});
