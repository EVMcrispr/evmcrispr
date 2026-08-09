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
  name: "bytes.at",
  description:
    "Access a single byte by index in a bytes value. As @bytes.at! a one-byte slice of the bytes/string return of a call, on-chain — negative indexes resolve against the live byte length at assertion time.",
  returnType: "bytes",
  args: [
    {
      name: "value",
      type: "bytes",
      description:
        "Input value (in @bytes.at! a `::` call expression or chain returning a bytes or string value)",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based byte index (negative counts from the end)",
    },
  ],
  async run(_, { value, index }) {
    const hex = String(value);
    const byteLen = (hex.length - 2) / 2;
    const i = Num(index).toNumber();
    const resolved = i < 0 ? byteLen + i : i;

    if (resolved < 0 || resolved >= byteLen) {
      throw new ErrorException(
        `@bytes.at: index ${i} out of bounds for ${byteLen} bytes`,
      );
    }

    return `0x${hex.slice(2 + resolved * 2, 2 + resolved * 2 + 2)}`;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@bytes.at! expects (call index), e.g. @bytes.at!($oracle::blob() 0)",
      );
    }
    const arg = await chainArgWithLens(ctx, "bytes.at!", node.args[0]);
    requireBytesLike(arg, "bytes.at!");
    const s = lensedDataOperand(ctx, arg);
    const index = await constIntArg(ctx, "bytes.at!", "index", node.args[1]);
    // The @str.at! recipe with the Bytes category: a one-byte slice, a
    // negative index becoming sub(byteLen(s), k) so it resolves against
    // the live byte length at assertion time.
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
    return {
      kind: "call",
      param: sliceParam(ctx, s, start, 1n),
      cat: "Bytes",
    };
  },
});
