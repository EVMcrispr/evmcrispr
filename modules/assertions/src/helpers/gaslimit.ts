import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "gaslimit",
  description: "The block gas limit at assertion time.",
  returnType: "number",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@gaslimit! takes no arguments");
    return opsCall(ctx, encodeOperator("gasLimit"), "Uint");
  },
});
