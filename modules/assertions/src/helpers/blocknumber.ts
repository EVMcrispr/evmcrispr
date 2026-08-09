import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "blocknumber",
  batchable: false,
  description:
    "The block number: the latest block at script build time as @blocknumber, the block at assertion time as @blocknumber!.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    return Num(await client.getBlockNumber());
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@blocknumber! takes no arguments");
    return opsCall(ctx, encodeOperator("blockNumber"), "Uint");
  },
});
