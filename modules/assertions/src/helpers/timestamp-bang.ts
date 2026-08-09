import { ErrorException } from "@evmcrispr/sdk";
import { opsCall } from "../lib/compiler";
import { encodeOperator } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "timestamp!",
  description:
    "The block timestamp at assertion time (not at script build time).",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@timestamp! takes no arguments");
    return opsCall(ctx, encodeOperator("timestamp"), "Uint");
  },
});
