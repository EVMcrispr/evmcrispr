import type { HelperFunctionNode } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import type { Chain, CompilerCtx } from "../lib/compiler";
import { chainArgWithLens, combinatorCall } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

/** Compile `@len!(call)` into the chain it measures. Used both by the
 *  assert command's top-level array-length fast path and the nested
 *  arrayLengthCall form below. */
export async function compileLenChain(
  ctx: CompilerCtx,
  node: HelperFunctionNode,
): Promise<Chain> {
  if (node.args.length !== 1) {
    throw new ErrorException("@len! expects a single call argument");
  }
  return chainArgWithLens(ctx, "len!", node.args[0]);
}

export default defineBangHelper({
  name: "len!",
  description:
    "The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "any",
      description:
        "A `::` call expression (or chain) returning an array, string or bytes",
    },
  ],
  compileAssert: async (ctx, node) => {
    const chain = await compileLenChain(ctx, node);
    return combinatorCall(
      ctx,
      encodeCombinator("arrayLengthCall", [chain.root, chain.calls]),
      "Uint",
    );
  },
});
