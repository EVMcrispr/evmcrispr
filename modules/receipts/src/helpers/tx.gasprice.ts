import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "tx.gasprice",
  description: "Gas price of the executing transaction, in wei.",
  returnType: "number",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@tx.gasprice! takes no arguments");
    return opsCall(ctx, encodeOperator("gasPrice"), "Uint");
  },
});
