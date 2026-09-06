import {
  defineHelper,
  ErrorException,
  encodeParams,
  valueEq,
} from "@evmcrispr/sdk";
import {
  abiEqualityCallback,
  arrayValuesParam,
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  compileArgSpecs,
  compileOperand,
  constBigInt,
  FOLD_EXIT,
  foldParam,
  formatParamType,
  includesWordParam,
  opSelector,
  rawParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { arrayArg } from "../utils/genericCollections";

export default defineHelper<Lang>({
  name: "includes",
  description: "Check whether an array contains an element.",
  compileDescription:
    "The element may be constant or live. Generic arrays compare canonical ABI values, preserving dynamic tuple and array boundaries.",
  returnType: "bool",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array",
    },
    {
      name: "item",
      type: "any",
      description: "Element to search for",
    },
  ],
  async run(_, { value, item }) {
    return value.some((el: unknown) => valueEq(el, item)) ? "true" : "false";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@includes! expects (call item), e.g. @includes!($safe::getOwners() @me)",
      );
    }
    const array = await arrayArg(ctx, node.args[0], "includes!");
    if (!array.words) {
      const fn = {
        type: "function" as const,
        name: "needle",
        stateMutability: "pure" as const,
        inputs: [array.element],
        outputs: [],
      };
      const spec = (
        await compileArgSpecs(ctx, [node.args[1]], fn, "includes needle")
      )[0];
      const needle =
        spec.kind === "value"
          ? {
              kind: "value" as const,
              value: encodeParams(
                [array.element],
                [spec.value] as never,
                "includes needle",
              ),
            }
          : canonicalArgSpec(
              ctx,
              { type: "bytes" },
              canonicalBytesParam(ctx, spec.param),
            );
      const index = collectionReadParam(ctx, "indexOfValues", [
        { kind: "value", value: formatParamType(array.element) },
        canonicalArgSpec(
          ctx,
          { type: "bytes[]" },
          arrayValuesParam(ctx, array),
        ),
        needle,
        abiEqualityCallback(ctx, array.element),
      ]);
      return {
        kind: "call",
        cat: "Bool",
        param: wordOpParam(
          ctx,
          "ne",
          false,
          index,
          rawParam(toWord((1n << 256n) - 1n)),
        ),
      };
    }
    const payload = array.words;

    const item = await compileOperand(ctx, node.args[1]);

    if (item.kind === "call") {
      // A live element cannot be baked into a lambda template, so it takes
      // the wordIndexOf path, which carries its needle as an argument.
      if (item.cat === "String" || item.cat === "Bytes") {
        throw new ErrorException(
          "@includes! cannot search an array for a live string or bytes value — the elements are single words, so hash it first with @hash!(…) and search an array of digests, or use @str.includes! to look inside one string",
        );
      }
      return {
        kind: "call",
        param: includesWordParam(ctx, payload, item.param),
        cat: "Bool",
      };
    }

    // A constant element keeps the single-read fold. The wordIndexOf form
    // would work here too, but it references the payload twice — the
    // source call resolves twice on-chain — and only pays that back on
    // arrays of roughly ten elements or more, which is above where the
    // owner/cap lists this face is used on actually sit.
    const word = constBigInt(item);
    // eq(<item>, <element>) — the element window is the second word (36);
    // eq ignores the accumulator, so both fold windows share it.
    const template: Hex = `0x${opSelector("eq").slice(2)}${toWord(word).slice(2)}${toWord(0n).slice(2)}`;
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        ctx.operators,
        template,
        36n,
        [36n],
        0n,
        FOLD_EXIT.Any,
      ),
      cat: "Bool",
    };
  },
});
