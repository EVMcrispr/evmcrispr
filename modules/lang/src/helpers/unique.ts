import type { Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, valueKey } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  compileCollectionCallback,
  formatParamType,
  OP_SELECTORS,
  opReadParam,
  packedArrayOperand,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "unique",
  description:
    "Remove duplicates from an array, preserving first-occurrence order.",
  compileDescription:
    "Removes all duplicates while preserving first-occurrence order.",
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
        "@unique! expects a single array argument, e.g. @unique!(@sort!($safe::getOwners()))",
      );
    }
    if (node.args[1]) {
      const array = await typedArrayArg(ctx, node.args[0], "unique!");
      const { callbackSpec, output } = await compileCollectionCallback(
        ctx,
        node.args[1],
        [array.element, array.element],
      );
      if (output.type !== "bool")
        throw new ErrorException("@unique! equality callback must return bool");
      return packedArrayOperand(
        ctx,
        collectionReadParam(ctx, "distinctValues", [
          { kind: "value", value: formatParamType(array.element) },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            arrayValuesParam(ctx, array),
          ),
          callbackSpec,
        ]),
        array.element,
      );
    }
    const { payload, elemType } = await wordsArg(ctx, node.args[0], "unique!");
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.distinctWords, [payload]),
      cat: "Bytes",
      collection: { element: { type: elemType }, transport: "words" },
    };
  },
});
