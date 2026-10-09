import {
  asNum,
  defineHelper,
  ErrorException,
  isSignedInteger,
  markSignedInteger,
  Num,
} from "@evmcrispr/sdk";
import {
  FOLD_EXIT,
  foldParam,
  opSelector,
  REDUCE,
  reduceWordsParam,
  sumWordsParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "sum",
  description: "Sum the elements of an array.",
  returnType: "number",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
  ],
  async run(_, { arr }) {
    let acc = Num(0n);
    let signed = false;
    for (const item of arr) {
      // asNum, not Num(item): a uint256[] read arrives as bigint[], and Num
      // throws outright on a JS number rather than coercing.
      const n = asNum(item);
      if (!n) {
        throw new ErrorException(
          `@sum: every element must be numeric, got ${String(item)}`,
        );
      }
      signed ||= n.lt(Num(0n)) || isSignedInteger(n);
      acc = acc.add(n);
    }
    return signed ? markSignedInteger(acc) : acc;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@sum! expects a single call argument, e.g. @sum!($vault::!{caps()(uint256[])})",
      );
    }
    const { payload, elemType, mapOf } = await wordsArg(
      ctx,
      node.args[0],
      "sum!",
    );
    if (!/^u?int\d*$/.test(elemType)) {
      throw new ErrorException("@sum! every element must be numeric");
    }
    const signed = elemType.startsWith("int");
    // An unsigned sum of a word map adds each result as the map produces
    // it: one pass, and no mapped copy to sum afterwards. A signed sum
    // keeps the signed fold, since the fused sum is unsigned.
    if (mapOf && !signed)
      return {
        kind: "call",
        cat: "Uint",
        param: reduceWordsParam(
          ctx,
          mapOf.words,
          mapOf.target,
          mapOf.template,
          mapOf.elemOffsets,
          REDUCE.Sum,
        ),
      };
    return {
      kind: "call",
      param: signed
        ? foldParam(
            ctx,
            "foldWords",
            payload,
            ctx.operators,
            `${opSelector("add", true)}${toWord(0n).slice(2)}${toWord(0n).slice(2)}`,
            4n,
            [36n],
            0n,
            FOLD_EXIT.Full,
          )
        : sumWordsParam(ctx, payload),
      cat: signed ? "Int" : "Uint",
    };
  },
});
