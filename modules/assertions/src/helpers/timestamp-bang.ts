import { ErrorException } from "@evmcrispr/sdk";
import { encodeEnv } from "../lib/combinators";
import { combinatorCall } from "../lib/compiler";
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
    return combinatorCall(ctx, encodeEnv("Timestamp"), "Uint");
  },
});
