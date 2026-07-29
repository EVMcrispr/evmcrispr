import { defineHelper } from "@evmcrispr/sdk";
import type Explorer from "..";
import { requireReceipt, resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.gasUsed",
  batchable: false,
  experimental: true,
  description: "Gas used by a transaction (units of gas, not wei).",
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
    return requireReceipt(ctx).gasUsed.toString();
  },
});
