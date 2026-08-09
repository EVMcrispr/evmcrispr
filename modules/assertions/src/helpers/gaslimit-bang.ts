import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "gaslimit!",
  description: "The block gas limit at assertion time.",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@gaslimit! takes no arguments");
    return opsCall(ctx, encodeOperator("gasLimit"), "Uint");
  },
});
