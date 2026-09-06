import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { byteIndex, byteRangeParam } from "../utils/byteIndex";

export default defineHelper<Lang>({
  name: "bytes.at",
  description: "Access a single byte by index in a bytes value.",
  returnType: "bytes",
  args: [
    {
      name: "value",
      type: "bytes",
      description: "Source bytes value",
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
    const i = byteIndex(index);
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
    const source = lensedDataOperand(ctx, arg);
    return {
      kind: "call",
      param: await byteRangeParam(
        ctx,
        source,
        node.args[1],
        undefined,
        false,
        true,
      ),
      cat: "Bytes",
    };
  },
});
