import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { combinatorCall, requireChainArg } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "includes!",
  description:
    "Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards.",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "part",
      type: "string",
      description: "Non-empty byte sequence to search for",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        '@includes! expects (call part), e.g. @includes!($pool::name() "LP")',
      );
    }
    const chain = await requireChainArg(ctx, "includes!", node.args[0]);
    const part = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof part !== "string" || part.length === 0) {
      throw new ErrorException(
        "@includes! part must be a non-empty string (every string contains the empty string)",
      );
    }
    return combinatorCall(
      ctx,
      encodeCombinator("includesCall", [chain.root, chain.calls, part]),
      "Bool",
    );
  },
});
