import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
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
    return opsCall(ctx, encodeOperator("chainId"), "Uint");
  },
});
