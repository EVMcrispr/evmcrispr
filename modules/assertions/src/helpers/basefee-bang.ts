import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "basefee!",
  description:
    "The block base fee in wei at assertion time: gate a batch on fee conditions.",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@basefee! takes no arguments");
    return opsCall(ctx, encodeOperator("baseFee"), "Uint");
  },
});
