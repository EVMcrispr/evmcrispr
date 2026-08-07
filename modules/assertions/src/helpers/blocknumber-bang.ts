import { ErrorException } from "@evmcrispr/sdk";
import { encodeEnv } from "../lib/combinators";
import { combinatorCall } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "blocknumber!",
  description: "The block number at assertion time (not at script build time).",
  returnType: "number",
  args: [],
  compileAssert: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@blocknumber! takes no arguments");
    return combinatorCall(ctx, encodeEnv("BlockNumber"), "Uint");
  },
});
