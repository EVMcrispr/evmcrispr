import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { InputParam } from "@evmcrispr/sdk/onchain";
import {
  byteLenParamOf,
  chainArgWithLens,
  constIntArg,
  lensedDataOperand,
  rawParam,
  requireBytesLike,
  sliceParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.slice",
  description: "Extract a section of a string.",
  compileDescription:
    "Slices bytes, so a multi-byte UTF-8 character may be cut in half.",
  returnType: "string",
  args: [
    {
      name: "value",
      type: "string",
      description: "Source string or bytes value",
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
    return String(value).slice(s, e);
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 3) {
      throw new ErrorException(
        "@str.slice! expects (call start end?), e.g. @str.slice!($pool::name() 0 5)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.slice!", node.args[0]);
    requireBytesLike(arg, "str.slice!");
    const s = lensedDataOperand(ctx, arg);
    const start = await constIntArg(ctx, "str.slice!", "start", node.args[1]);
    const end =
      node.args[2] !== undefined
        ? await constIntArg(ctx, "str.slice!", "end", node.args[2])
        : undefined;

    // A negative build-time index resolves against the LIVE byte length:
    // -k becomes sub(byteLen(s), k) spliced as a word operand.
    const liveSub = (a: InputParam, k: bigint): InputParam =>
      wordOpParam(ctx, "sub", false, a, rawParam(toWord(k)));

    const startPiece: bigint | InputParam =
      start >= 0n ? start : liveSub(byteLenParamOf(ctx, s), -start);
    let len: bigint | InputParam;
    if (end === undefined) {
      // To the end: constant length for a from-the-end start, live
      // byteLen(s) - start otherwise.
      len = start >= 0n ? liveSub(byteLenParamOf(ctx, s), start) : -start;
    } else if (start >= 0n && end >= 0n) {
      if (end < start) {
        throw new ErrorException(
          `@str.slice! end ${end} is before start ${start}`,
        );
      }
      len = end - start;
    } else if (start >= 0n) {
      // end < 0: len = byteLen(s) - |end| - start.
      len = liveSub(byteLenParamOf(ctx, s), -end + start);
    } else if (end < 0n) {
      // Both from the end: constant length.
      if (-end >= -start) {
        throw new ErrorException(
          `@str.slice! end ${end} is not after start ${start}`,
        );
      }
      len = -start + end;
    } else {
      // start < 0, end >= 0: live end - start. An empty-or-inverted range
      // reverts at assertion time — on-chain slicing has no silent clamp.
      len = wordOpParam(
        ctx,
        "sub",
        false,
        rawParam(toWord(end)),
        startPiece as InputParam,
      );
    }
    const t = arg.path ? arg.terminal?.type : arg.outputs[0]?.type;
    return {
      kind: "call",
      param: sliceParam(ctx, s, startPiece, len),
      cat: t === "bytes" ? "Bytes" : "String",
    };
  },
});
