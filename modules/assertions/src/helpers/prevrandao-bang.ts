import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "prevrandao!",
  description:
    "The previous RANDAO mix of the block at assertion time, as a number.",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@prevrandao! takes no arguments");
    return opsCall(ctx, encodeOperator("prevRandao"), "Uint");
  },
});
