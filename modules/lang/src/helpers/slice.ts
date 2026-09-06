import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  formatParamType,
  packedArrayOperand,
  rawParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { arrayArg, indexParam, indexValue } from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "slice",
  description: "Extract a section of an array.",
  compileDescription:
    "Supports typed arrays and live signed indices. Bounds clamp to the array length and end is exclusive, matching the off-chain helper.",
  returnType: "array",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array",
    },
    {
      name: "start",
      type: "number",
      description: "Start index (inclusive; negative counts from the end)",
    },
    {
      name: "end",
      type: "number",
      description:
        "End index (exclusive; negative counts from the end; omitted = to the end)",
      optional: true,
    },
  ],
  async run(_, { value, start, end }) {
    const s = Number(indexValue(start));
    const e = end !== undefined ? Number(indexValue(end)) : undefined;
    return value.slice(s, e);
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3)
      throw new ErrorException(
        "@slice! expects an array, start, and optional end",
      );
    const array = await arrayArg(ctx, node.args[0], "slice!");
    const start = await indexParam(ctx, node.args[1]);
    const end = node.args[2]
      ? await indexParam(ctx, node.args[2])
      : rawParam(toWord((1n << 255n) - 1n));
    return packedArrayOperand(
      ctx,
      collectionReadParam(ctx, "sliceValues", [
        { kind: "value", value: formatParamType(array.element) },
        canonicalArgSpec(
          ctx,
          { type: "bytes[]" },
          arrayValuesParam(ctx, array),
        ),
        { kind: "word", param: start },
        { kind: "word", param: end },
      ]),
      array.element,
    );
  },
});
