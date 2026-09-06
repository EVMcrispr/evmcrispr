import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  buildCallSegments,
  canonicalArgSpec,
  chainArgWithLens,
  encodeRead,
  lensedDataOperand,
  rawParam,
  requireBytesLike,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem } from "viem";
import type Lang from "..";
import { indexedNav, indexParam } from "../utils/genericCollections";
import { stringArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "str.split",
  description:
    "Split a string by a delimiter into an array of strings, or select one segment when an index is given.",
  compileDescription:
    "Returns the complete array when no index is supplied; indexed selection supports negative indexes.",
  returnType: ["array", "string"],
  args: [
    {
      name: "s",
      type: "string",
      description: "Source string",
    },
    {
      name: "delim",
      type: "string",
      description: "Exact, non-empty delimiter byte sequence",
    },
    {
      name: "index",
      type: "number",
      optional: true,
      description:
        "Segment to select instead of the whole array: zero-based from the start, or negative from the end (-1 = last, -2 = second-last, and so on)",
    },
  ],
  async run(_, { s, delim, index }) {
    if (String(delim).length === 0)
      throw new ErrorException("@str.split delimiter must be non-empty");
    const parts = String(s).split(String(delim));
    if (index === undefined) return parts;
    const i = Number(index);
    const at = i < 0 ? parts.length + i : i;
    if (!Number.isInteger(i) || at < 0 || at >= parts.length) {
      throw new ErrorException(
        `@str.split index ${index} is out of range for ${parts.length} segments`,
      );
    }
    return parts[at];
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new ErrorException(
        "@str.split! expects (call delimiter index), e.g. @str.split!($pool::name() ` ` 1) — segment indexes count from the start (0, 1, …) or from the end (-1, -2, …)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.split!", node.args[0]);
    requireBytesLike(arg, "str.split!");
    const { part: delimiter, text: delimiterText } = await stringArg(
      ctx,
      node.args[1],
      "str.split!",
      "delimiter",
    );
    if (delimiterText !== undefined && delimiterText.length === 0) {
      throw new ErrorException(
        "@str.split! delimiter must be a non-empty string",
      );
    }
    {
      const fn = parseAbiItem(
        "function split(bytes,bytes) pure returns (bytes[])",
      ) as AbiFunction;
      const delim =
        typeof delimiter === "string"
          ? { kind: "value" as const, value: delimiter }
          : canonicalArgSpec(
              ctx,
              { type: "bytes" },
              "param" in delimiter ? delimiter.param : delimiter,
            );
      const call = buildCallSegments(ctx, fn, [
        canonicalArgSpec(ctx, { type: "bytes" }, lensedDataOperand(ctx, arg)),
        delim,
      ]);
      const param = staticCallParam(
        ctx.core,
        encodeRead(
          rawParam(toWord(BigInt(ctx.operators))),
          call.selector,
          call.segments,
        ),
      );
      if (node.args[2])
        return {
          kind: "call",
          cat: "String",
          param: indexedNav(
            ctx,
            param,
            "(string[])",
            [0n],
            await indexParam(ctx, node.args[2]),
          ),
        };
      return {
        kind: "call",
        cat: "Bytes",
        param,
        collection: { element: { type: "string" }, transport: "abi" },
      };
    }
  },
});
