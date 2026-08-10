import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  byteLenParamOf,
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "bytes.len",
  description:
    "Byte length of a bytes value (a UTF-8 character may span several bytes).",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "bytes",
      description: "Source bytes or string value",
    },
  ],
  async run(_, { value }) {
    return Num(BigInt((String(value).length - 2) / 2));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@bytes.len! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "bytes.len!", node.args[0]);
    requireBytesLike(arg, "bytes.len!");
    return {
      kind: "call",
      param: byteLenParamOf(ctx, lensedDataOperand(ctx, arg)),
      cat: "Uint",
    };
  },
});
