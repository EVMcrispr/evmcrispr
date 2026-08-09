import { ErrorException } from "@evmcrispr/sdk";
import {
  byteLenParamOf,
  chainArgWithLens,
  lensedDataOperand,
  requireBytesLike,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "bytelen!",
  description:
    "The decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes.",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "address",
      description:
        "A `::` call expression (or chain) returning a string or bytes value",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@bytelen! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "bytelen!", node.args[0]);
    requireBytesLike(arg, "bytelen!");
    return {
      kind: "call",
      param: byteLenParamOf(ctx, lensedDataOperand(ctx, arg)),
      cat: "Uint",
    };
  },
});
