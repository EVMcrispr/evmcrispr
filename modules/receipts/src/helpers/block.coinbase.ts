import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "block.coinbase",
  description: "The block proposer fee recipient address at assertion time.",
  returnType: "address",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.coinbase! takes no arguments");
    return opsCall(ctx, encodeOperator("coinbase"), "Address");
  },
});
