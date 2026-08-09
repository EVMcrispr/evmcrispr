import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "blobbasefee",
  description: "The blob base fee in wei at assertion time.",
  returnType: "number",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@blobbasefee! takes no arguments");
    return opsCall(ctx, encodeOperator("blobBaseFee"), "Uint");
  },
});
