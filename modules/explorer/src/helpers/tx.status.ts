import { defineHelper } from "@evmcrispr/sdk";
import type Explorer from "..";
import { requireReceipt, resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.status",
  batchable: false,
  experimental: true,
  description:
    "Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending.",
  returnType: "bool",
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
    return requireReceipt(ctx).status === "success";
  },
});
