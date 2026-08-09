import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "prevrandao",
  description:
    "The previous RANDAO mix of the block at assertion time, as a number.",
  returnType: "number",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@prevrandao! takes no arguments");
    return opsCall(ctx, encodeOperator("prevRandao"), "Uint");
  },
});
