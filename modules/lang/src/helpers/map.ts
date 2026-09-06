import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  compileCollectionCallback,
  formatParamType,
  mapWordsParam,
  packedArrayOperand,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordCallbackTemplate } from "../utils/wordCallback";

export default defineHelper<Lang>({
  name: "map",
  description: "Transform each element of an array by applying a helper.",
  compileDescription:
    "Uses named callbacks that compose helpers and ABI calls, preserving argument and result types, including multiword values.",
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
      description: "Transform helper applied to each element",
    },
  ],
  async run(_, { arr, fn }) {
    const results = [];
    for (const item of arr) {
      results.push(await fn(item));
    }
    return results;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@map! expects (call transform), e.g. @map!($vault::caps() @dbl!) with def @dbl! "$x: number -> number" @calc!($x * 2)',
      );
    }
    const array = await typedArrayArg(ctx, node.args[0], "map!");
    const { callbackSpec, output } = await compileCollectionCallback(
      ctx,
      node.args[1],
      [array.element],
    );
    const tpl = array.words
      ? await wordCallbackTemplate(ctx, node.args[1], [array.element], output)
      : undefined;
    if (!tpl) {
      const values = arrayValuesParam(ctx, array);
      const result = collectionReadParam(ctx, "mapValues", [
        { kind: "value", value: formatParamType(array.element) },
        { kind: "value", value: formatParamType(output) },
        canonicalArgSpec(ctx, { type: "bytes[]" }, values),
        callbackSpec,
      ]);
      return packedArrayOperand(ctx, result, output);
    }
    return {
      kind: "call",
      param: mapWordsParam(
        ctx,
        array.words!,
        tpl.target,
        tpl.template,
        tpl.elemOffsets,
      ),
      cat: "Bytes",
      collection: {
        element: output,
        transport: "words",
      },
    };
  },
});
