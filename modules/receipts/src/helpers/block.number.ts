import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "block.number",
  batchable: false,
  description:
    "The block number: the latest block at script build time as @block.number, the block at assertion time as @block.number!.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    return Num(await client.getBlockNumber());
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.number! takes no arguments");
    return opsCall(ctx, encodeOperator("blockNumber"), "Uint");
  },
});
