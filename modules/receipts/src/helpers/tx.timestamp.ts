import { defineHelper } from "@evmcrispr/sdk";
import type Receipts from "..";
import { requireReceipt, resolveTxContext } from "../utils/txContext";

export default defineHelper<Receipts>({
  name: "tx.timestamp",
  batchable: false,
  experimental: true,
  description:
    "Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values.",
  returnType: "number",
  args: [
    { name: "hash", type: "bytes32", description: "Transaction hash" },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { hash, chain }) {
    const ctx = await resolveTxContext(module, hash, chain);
    requireReceipt(ctx);
    return (await ctx.getBlock()).timestamp.toString();
  },
});
