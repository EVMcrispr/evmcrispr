import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "tx.origin",
  description:
    "The transaction origin address at assertion time: gate a batch on who is executing it.",
  returnType: "address",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@tx.origin! takes no arguments");
    return opsCall(ctx, encodeOperator("origin"), "Address");
  },
});
