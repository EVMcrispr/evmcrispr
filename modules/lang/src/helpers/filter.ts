import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  compileCollectionCallback,
  filterWordsParam,
  formatParamType,
  packedArrayOperand,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordCallbackTemplate } from "../utils/wordCallback";

export default defineHelper<Lang>({
  name: "filter",
  description: "Keep elements of an array for which a helper returns truthy.",
  compileDescription:
    "Uses a named boolean predicate. Callbacks may compose helpers and ABI calls over typed word or multiword values.",
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
    const { callbackSpec, output } = await compileCollectionCallback(
      ctx,
      node.args[1],
      [array.element],
    );
    if (output.type !== "bool")
      throw new ErrorException("@filter! callback must return bool");
    const tpl = array.words
      ? await wordCallbackTemplate(ctx, node.args[1], [array.element], output)
      : undefined;
    if (!tpl) {
      const values = arrayValuesParam(ctx, array);
      const result = collectionReadParam(ctx, "filterValues", [
        { kind: "value", value: formatParamType(array.element) },
        canonicalArgSpec(ctx, { type: "bytes[]" }, values),
        callbackSpec,
      ]);
      return packedArrayOperand(ctx, result, array.element, {
        validated: true,
      });
    }
    return {
      kind: "call",
      param: filterWordsParam(
        ctx,
        array.words!,
        tpl.target,
        tpl.template,
        tpl.elemOffsets,
      ),
      cat: "Bytes",
      collection: { element: array.element, transport: "words" },
    };
  },
});
