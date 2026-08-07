import type { HelperFunctionNode } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { LEN_STEP } from "../lib/combinators";
import type { Chain, CompilerCtx } from "../lib/compiler";
import {
  chainArgWithLens,
  combinatorCall,
  encodeReadChain,
  formatReturnTuple,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

/** Compile `@len!(call)` into the chain it measures. Used both by the
 *  assert command's top-level array-length fast path and the nested
 *  LEN-path form below. */
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
      type: "address",
      description:
        "A `::` call expression (or chain) returning an array, string or bytes",
    },
  ],
  compileAssert: async (ctx, node) => {
    const chain = await compileLenChain(ctx, node);
    const outputs = chain.lastAbi.outputs!;
    if (outputs.length !== 1) {
      throw new ErrorException(
        "@len! needs a single return value; select one with a lens",
      );
    }
    const t = outputs[0].type;
    if (!/\[\]$/.test(t) && t !== "string" && t !== "bytes") {
      throw new ErrorException(
        `@len! needs a dynamic return value (array, string or bytes), got ${t}`,
      );
    }
    // A typed read path ending in the LEN sentinel returns the decoded
    // length of the navigated value as a word.
    return combinatorCall(
      ctx,
      encodeReadChain(chain, formatReturnTuple(outputs), [0n, LEN_STEP]),
      "Uint",
    );
  },
});
