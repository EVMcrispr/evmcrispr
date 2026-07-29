import { defineHelper } from "@evmcrispr/sdk";
import type Explorer from "..";
import { renderTxSummary } from "../utils/renderTxSummary";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx",
  batchable: false,
  experimental: true,
  description:
    "Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @explorer:tx.* field helpers for machine-readable values.",
  returnType: "string",
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
    return renderTxSummary(module, ctx);
  },
});
