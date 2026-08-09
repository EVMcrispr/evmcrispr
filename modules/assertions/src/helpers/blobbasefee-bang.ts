import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "blobbasefee!",
  description: "The blob base fee in wei at assertion time.",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@blobbasefee! takes no arguments");
    return opsCall(ctx, encodeOperator("blobBaseFee"), "Uint");
  },
});
