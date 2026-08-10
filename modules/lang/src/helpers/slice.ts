import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { InputParam } from "@evmcrispr/sdk/onchain";
import {
  byteLenParamOf,
  constIntArg,
  rawParam,
  sliceParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "slice",
  description: "Extract a section of an array.",
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
    const s = Num(start).toNumber();
    const e = end !== undefined ? Num(end).toNumber() : undefined;
    return value.slice(s, e);
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new ErrorException(
        "@slice! expects (call start end?), e.g. @slice!($safe::getOwners() 0 3)",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "slice!");
    const start = await constIntArg(ctx, "slice!", "start", node.args[1]);
    const end =
      node.args[2] !== undefined
        ? await constIntArg(ctx, "slice!", "end", node.args[2])
        : undefined;

    // The @str.slice! recipe over the WORDS payload: element indices
    // scale by 32 into byte offsets at composition time, and a negative
    // bound becomes sub(byteLen(payload), 32k) — byteLen of the payload
    // IS the live length word in byte units, so the live pieces need no
    // extra scaling call.
    const liveSub = (a: InputParam, k: bigint): InputParam =>
      wordOpParam(ctx, "sub", false, a, rawParam(toWord(k)));

    const startPiece: bigint | InputParam =
      start >= 0n
        ? start * 32n
        : liveSub(byteLenParamOf(ctx, payload), -start * 32n);
    let len: bigint | InputParam;
    if (end === undefined) {
      // To the end: constant length for a from-the-end start, live
      // byteLen(payload) - 32*start otherwise.
      len =
        start >= 0n
          ? liveSub(byteLenParamOf(ctx, payload), start * 32n)
          : -start * 32n;
    } else if (start >= 0n && end >= 0n) {
      if (end < start) {
        throw new ErrorException(`@slice! end ${end} is before start ${start}`);
      }
      len = (end - start) * 32n;
    } else if (start >= 0n) {
      // end < 0: len = byteLen(payload) - 32*(|end| + start).
      len = liveSub(byteLenParamOf(ctx, payload), (-end + start) * 32n);
    } else if (end < 0n) {
      // Both from the end: constant length.
      if (-end >= -start) {
        throw new ErrorException(
          `@slice! end ${end} is not after start ${start}`,
        );
      }
      len = (end - start) * 32n;
    } else {
      // start < 0, end >= 0: live 32*end - startPiece. An empty-or-
      // inverted range reverts at assertion time — on-chain slicing has
      // no silent clamp.
      len = wordOpParam(
        ctx,
        "sub",
        false,
        rawParam(toWord(end * 32n)),
        startPiece as InputParam,
      );
    }
    return {
      kind: "call",
      param: sliceParam(ctx, payload, startPiece, len),
      cat: "Bytes",
    };
  },
});
