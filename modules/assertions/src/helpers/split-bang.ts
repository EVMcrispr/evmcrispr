import { ErrorException } from "@evmcrispr/sdk";
import { stringToHex } from "viem";
import {
  chainArgWithLens,
  constIntArg,
  lensedDataOperand,
  requireBytesLike,
} from "../lib/compiler";
import { splitParam } from "../lib/recipes";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "split!",
  description:
    "Split the string return of a call on a delimiter and select one segment, on-chain. Segment indexes are 0, 1, 2, … from the start, or -1, -2, … from the end (-1 is the last segment).",
  returnType: "string",
  args: [
    {
      name: "call",
      type: "address",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "delimiter",
      type: "string",
      description: "Exact, non-empty byte sequence to split on",
    },
    {
      name: "index",
      type: "number",
      description:
        "Segment index to select: zero-based from the start, or negative from the end (-1 = last, -2 = second-last, …)",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        "@split! expects (call delimiter index), e.g. @split!($pool::name() ` ` 1) — segment indexes count from the start (0, 1, …) or from the end (-1, -2, …)",
      );
    }
    const arg = await chainArgWithLens(ctx, "split!", node.args[0]);
    requireBytesLike(arg, "split!");
    const delimiter = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof delimiter !== "string" || delimiter.length === 0) {
      throw new ErrorException("@split! delimiter must be a non-empty string");
    }
    const index = await constIntArg(ctx, "split!", "index", node.args[2]);
    return {
      kind: "call",
      param: splitParam(
        ctx,
        lensedDataOperand(ctx, arg),
        stringToHex(delimiter),
        index,
      ),
      cat: "String",
    };
  },
});
