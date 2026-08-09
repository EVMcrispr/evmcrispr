import { defineHelper } from "@evmcrispr/sdk";
import type Receipts from "..";
import { requireReceipt, resolveTxContext } from "../utils/txContext";

export default defineHelper<Receipts>({
  name: "tx.block",
  batchable: false,
  experimental: true,
  description: "Block number a transaction was mined in.",
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
    return requireReceipt(ctx).blockNumber.toString();
  },
});
