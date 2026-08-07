import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { combinatorCall, constIntArg, requireChainArg } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "at!",
  description:
    "Extract a raw 32-byte word from the return data of a call by word index, on-chain. Raw layout, not decoded — for dynamic-array elements use a nested lens like [[_ $]] instead. A negative index counts from the end (-1 = last word).",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "address",
      description: "A `::` call expression (or chain) to read",
    },
    {
      name: "index",
      type: "number",
      description:
        "32-byte word index into the raw return data: zero-based from the start, negative from the end (-1 = last)",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@at! expects (call wordIndex), e.g. @at!($pool::getReserves() 1)",
      );
    }
    const chain = await requireChainArg(ctx, "at!", node.args[0]);
    const index = await constIntArg(ctx, "at!", "word index", node.args[1]);
    return combinatorCall(
      ctx,
      encodeCombinator("uintCall", [chain.root, chain.calls, index]),
      "Uint",
    );
  },
});
