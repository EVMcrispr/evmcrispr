import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { chainArgWithLens, combinatorCall } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "hash!",
  description:
    "keccak256 of the raw return data of a call, computed on-chain — compare structs, arrays or long strings against a precomputed hash.",
  returnType: "bytes32",
  args: [
    {
      name: "call",
      type: "address",
      description: "A `::` call expression (or chain) to hash",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@hash! expects a single call argument");
    }
    const chain = await chainArgWithLens(ctx, "hash!", node.args[0]);
    return combinatorCall(
      ctx,
      encodeCombinator("hashCall", [chain.root, chain.calls]),
      "Bytes32",
    );
  },
});
