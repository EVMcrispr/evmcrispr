import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  formatParamType,
  OP_SELECTORS,
  opReadParam,
  packedArrayOperand,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { arrayArg } from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "reverse",
  description: "Reverse the order of an array's elements.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    return [...arr].reverse();
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@reverse! expects a single array argument, e.g. @reverse!($safe::getOwners())",
      );
    }
    const array = await arrayArg(ctx, node.args[0], "reverse!");
    if (!array.words)
      return packedArrayOperand(
        ctx,
        collectionReadParam(ctx, "reverseValues", [
          { kind: "value", value: formatParamType(array.element) },
          canonicalArgSpec(
            ctx,
            { type: "bytes[]" },
            arrayValuesParam(ctx, array),
          ),
        ]),
        array.element,
      );
    const payload = array.words!;
    const elemType = array.element.type;
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.reverseWords, [payload]),
      cat: "Bytes",
      collection: { element: { type: elemType }, transport: "words" },
    };
  },
});
