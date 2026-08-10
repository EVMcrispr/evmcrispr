import { defineHelper, ErrorException, valueEq } from "@evmcrispr/sdk";
import {
  compileOperand,
  constBigInt,
  FOLD_EXIT,
  foldParam,
  includesWordParam,
  opSelector,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "includes",
  description: "Check whether an array contains an element.",
  compileDescription:
    "The element may be a build-time constant or a live value; a live string or bytes element has to be hashed first.",
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
    const { payload } = await wordsArg(ctx, node.args[0], "includes!");
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
