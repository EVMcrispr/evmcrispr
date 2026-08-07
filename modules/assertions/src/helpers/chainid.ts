import { ErrorException } from "@evmcrispr/sdk";
import { encodeCombinator } from "../lib/combinators";
import { combinatorCall } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "chainid!",
  description:
    "The chain id at assertion time, read on-chain — unlike assert-chainid it composes into expressions.",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@chainid! takes no arguments");
    return combinatorCall(ctx, encodeCombinator("chainId", []), "Uint");
  },
});
