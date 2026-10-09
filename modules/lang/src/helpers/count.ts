import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  arrayLengthParam,
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  compileCollectionCallback,
  filterWordsParam,
  formatParamType,
  packedArrayOperand,
  REDUCE,
  reduceWordsParam,
  typedArrayArg,
  typedArrayFromOperand,
  wordCountParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordCallbackTemplate, wordReduction } from "../utils/wordCallback";

export default defineHelper<Lang>({
  name: "count",
  description: "Count the elements of an array that satisfy the predicate.",
  returnType: "number",
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
    let count = 0n;
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") count++;
    }
    return Num(count);
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@count! expects (call predicate), e.g. @count!($vault::caps() @ge100!) with def @ge100! "$x: number -> bool" @bool!($x >= 100)',
      );
    }
    const array = await typedArrayArg(ctx, node.args[0], "count!");
    const { callbackSpec, output } = await compileCollectionCallback(
      ctx,
      node.args[1],
      [array.element],
    );
    if (output.type !== "bool")
      throw new ErrorException("@count! predicate must return bool");
    if (array.words) {
      const reduction = await wordReduction(ctx, node.args[1], array.element);
      if (reduction)
        return {
          kind: "call",
          cat: "Uint",
          param: reduceWordsParam(
            ctx,
            array.words,
            reduction.target,
            reduction.template,
            reduction.elemOffsets,
            REDUCE.Count,
            reduction.cmp,
            reduction.bound,
          ),
        };
      const tpl = await wordCallbackTemplate(
        ctx,
        node.args[1],
        [array.element],
        output,
        { checkedBool: true },
      );
      if (tpl)
        return {
          kind: "call",
          cat: "Uint",
          param: wordCountParam(
            ctx,
            filterWordsParam(
              ctx,
              array.words,
              tpl.target,
              tpl.template,
              tpl.elemOffsets,
            ),
          ),
        };
    }
    const kept = packedArrayOperand(
      ctx,
      collectionReadParam(ctx, "filterValues", [
        { kind: "value", value: formatParamType(array.element) },
        canonicalArgSpec(
          ctx,
          { type: "bytes[]" },
          arrayValuesParam(ctx, array),
        ),
        callbackSpec,
      ]),
      array.element,
      { validated: true },
    );
    return {
      kind: "call",
      cat: "Uint",
      param: arrayLengthParam(ctx, typedArrayFromOperand(ctx, kept, "count!")),
    };
  },
});
