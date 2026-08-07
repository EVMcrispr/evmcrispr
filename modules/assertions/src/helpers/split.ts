import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { chainArgWithLens, combinatorCall, constIntArg } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "split!",
  description:
    "Split the string return of a call on a delimiter and select one segment, on-chain. A negative index counts from the end (-1 = last segment).",
  returnType: "string",
  args: [
    {
      name: "call",
      type: "any",
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
        "Segment index to select: zero-based from the start, negative from the end (-1 = last)",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 3) {
      throw new ErrorException(
        '@split! expects (call delimiter index), e.g. @split!($pool::name() " " 1) — a negative index counts from the end (-1 = last segment)',
      );
    }
    const chain = await chainArgWithLens(ctx, "split!", node.args[0]);
    const delimiter = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof delimiter !== "string" || delimiter.length === 0) {
      throw new ErrorException("@split! delimiter must be a non-empty string");
    }
    const index = await constIntArg(ctx, "split!", "index", node.args[2]);
    return combinatorCall(
      ctx,
      encodeCombinator("splitCall", [
        chain.root,
        chain.calls,
        delimiter,
        index,
      ]),
      "String",
    );
  },
});
