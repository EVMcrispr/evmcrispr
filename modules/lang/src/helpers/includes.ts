import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  constIntArg,
  FOLD_EXIT,
  foldParam,
  opSelector,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

function deepEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Num && b instanceof Num) return a.eq(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEquals(v, b[i]));
  }
  return a === b;
}

export default defineHelper<Lang>({
  name: "includes",
  description: "Check whether an array contains an element.",
  compileDescription: "The element searched for must be a build-time constant.",
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
    return value.some((el: unknown) => deepEquals(el, item)) ? "true" : "false";
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@includes! expects (call item), e.g. @includes!($safe::getOwners() @me)",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "includes!");
    const item = await constIntArg(ctx, "includes!", "item", node.args[1]);
    // eq(<item>, <element>) — the element window is the second word (36);
    // eq ignores the accumulator, so both fold windows share it.
    const template: Hex = `0x${opSelector("eq").slice(2)}${toWord(item).slice(2)}${toWord(0n).slice(2)}`;
    return {
      kind: "call",
      param: foldParam(
        ctx,
        "foldWords",
        payload,
        template,
        36n,
        36n,
        0n,
        FOLD_EXIT.Any,
      ),
      cat: "Bool",
    };
  },
});
