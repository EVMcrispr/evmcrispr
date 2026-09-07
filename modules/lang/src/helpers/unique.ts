import type { Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, valueKey } from "@evmcrispr/sdk";
import {
  abiEqualityCallback,
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  compileCollectionCallback,
  formatParamType,
  packedArrayOperand,
  typedArrayArg,
  uniqueWordsParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "unique",
  description:
    "Remove duplicates from an array, preserving first-occurrence order.",
  compileDescription:
    "Uses canonical ABI equality by default, or a custom equality predicate, preserving first-occurrence order.",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    {
      name: "equal",
      type: "helper",
      optional: true,
      description: "Equality predicate for generic values",
    },
  ],
  async run(_, { arr, equal }) {
    if (equal) {
      const result: Param[] = [];
      for (const item of arr) {
        let seen = false;
        for (const prior of result) {
          const matches = await equal(prior, item);
          if (matches === true || matches === "true") {
            seen = true;
            break;
          }
        }
        if (!seen) result.push(item);
      }
      return result;
    }
    const seen = new Set<string>();
    const result: Param[] = [];
    for (const item of arr) {
      const key = valueKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  },
  compile: async (ctx, node) => {
    if (node.args.length < 1 || node.args.length > 2) {
      throw new ErrorException(
        "@unique! expects an array and an optional equality predicate",
      );
    }
    const array = await typedArrayArg(ctx, node.args[0], "unique!");
    if (node.args[1] || !array.words) {
      let callbackSpec = abiEqualityCallback(ctx, array.element);
      if (node.args[1]) {
        const compiled = await compileCollectionCallback(ctx, node.args[1], [
          array.element,
          array.element,
        ]);
        if (compiled.output.type !== "bool")
          throw new ErrorException(
            "@unique! equality callback must return bool",
          );
        callbackSpec = compiled.callbackSpec;
      }
      return packedArrayOperand(
        ctx,
        collectionReadParam(ctx, "uniqueValues", [
          { kind: "value", value: formatParamType(array.element) },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            arrayValuesParam(ctx, array),
          ),
          callbackSpec,
          { kind: "value", value: false },
        ]),
        array.element,
        { validated: true },
      );
    }
    return {
      kind: "call",
      param: uniqueWordsParam(ctx, array.words!, false),
      cat: "Bytes",
      collection: { element: array.element, transport: "words" },
    };
  },
});
