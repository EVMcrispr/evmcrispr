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
  name: "str.at",
  description:
    "Access a character by index in a string. As @str.at! a one-byte slice of the string return of a call, on-chain — negative indexes resolve against the live byte length at assertion time.",
  returnType: "string",
  args: [
    {
      name: "value",
      type: "string",
      description:
        "Input value (in @str.at! a `::` call expression or chain returning a string or bytes value)",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based character index (negative counts from the end)",
    },
  ],
  async run(_, { value, index }) {
    const str = String(value);
    const i = Num(index).toNumber();
    const resolved = i < 0 ? str.length + i : i;

    if (resolved < 0 || resolved >= str.length) {
      throw new ErrorException(
        `@str.at: index ${i} out of bounds for length ${str.length}`,
      );
    }

    return str[resolved];
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@str.at! expects (call index), e.g. @str.at!($pool::symbol() 0)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.at!", node.args[0]);
    requireBytesLike(arg, "str.at!");
    const s = lensedDataOperand(ctx, arg);
    const index = await constIntArg(ctx, "str.at!", "index", node.args[1]);
    // A one-byte slice; a negative index becomes sub(byteLen(s), k) so it
    // resolves against the live byte length at assertion time.
    const start: bigint | InputParam =
      index >= 0n
        ? index
        : wordOpParam(
            ctx,
            "sub",
            false,
            byteLenParamOf(ctx, s),
            rawParam(toWord(-index)),
          );
    const t = arg.path ? arg.terminal?.type : arg.outputs[0]?.type;
    return {
      kind: "call",
      param: sliceParam(ctx, s, start, 1n),
      cat: t === "bytes" ? "Bytes" : "String",
    };
  },
});
