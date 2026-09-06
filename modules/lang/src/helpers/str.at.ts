import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import {
  byteIndex,
  byteRangeParam,
  decodeStringSlice,
} from "../utils/byteIndex";

export default defineHelper<Lang>({
  name: "str.at",
  description:
    "Access one UTF-8 byte as a string; reject bytes belonging to multibyte characters.",
  compileDescription:
    "Selects one UTF-8 byte; a byte belonging to a multibyte character is rejected.",
  returnType: "string",
  args: [
    {
      name: "value",
      type: "string",
      description: "Source string",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based byte index (negative counts from the end)",
    },
  ],
  async run(_, { value, index }) {
    const str = new TextEncoder().encode(String(value));
    const i = byteIndex(index);
    const resolved = i < 0 ? str.length + i : i;

    if (resolved < 0 || resolved >= str.length) {
      throw new ErrorException(
        `@str.at: index ${i} out of bounds for length ${str.length}`,
      );
    }

    return decodeStringSlice(str.slice(resolved, resolved + 1));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@str.at! expects (call index), e.g. @str.at!($pool::symbol() 0)",
      );
    }
    const arg = await chainArgWithLens(ctx, "str.at!", node.args[0]);
    requireBytesLike(arg, "str.at!");
    const source = lensedDataOperand(ctx, arg);
    return {
      kind: "call",
      param: await byteRangeParam(
        ctx,
        source,
        node.args[1],
        undefined,
        true,
        true,
      ),
      cat: "String",
    };
  },
});
