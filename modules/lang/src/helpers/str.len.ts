import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  byteLenParamOf,
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.len",
  description:
    "Return the length of a string. As @str.len! the decoded byte length of the string return of a call, on-chain — there is no code-point walk at assertion time, so multi-byte UTF-8 characters count once per byte.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "string",
      description:
        "Input value (in @str.len! a `::` call expression or chain returning a string)",
    },
  ],
  async run(_, { value }) {
    return Num(BigInt(String(value).length));
  },
  // Same splice as @bytes.len!: the measured quantity on-chain is the
  // payload byte length.
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@str.len! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "str.len!", node.args[0]);
    requireBytesLike(arg, "str.len!");
    return {
      kind: "call",
      param: byteLenParamOf(ctx, lensedDataOperand(ctx, arg)),
      cat: "Uint",
    };
  },
});
