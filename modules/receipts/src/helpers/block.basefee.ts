import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "block.basefee",
  description:
    "The block base fee in wei at assertion time: gate a batch on fee conditions.",
  returnType: "number",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.basefee! takes no arguments");
    return opsCall(ctx, encodeOperator("baseFee"), "Uint");
  },
});
