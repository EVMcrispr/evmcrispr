import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "block.timestamp",
  batchable: false,
  description:
    "The block timestamp: the latest block at script build time as @block.timestamp, the block at assertion time as @block.timestamp!.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    const block = await client.getBlock({ blockTag: "latest" });
    return Num(block.timestamp);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.timestamp! takes no arguments");
    return opsCall(ctx, encodeOperator("timestamp"), "Uint");
  },
});
