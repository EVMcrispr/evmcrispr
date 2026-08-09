import { defineHelper } from "@evmcrispr/sdk";
import type Receipts from "..";
import {
  computeFee,
  requireReceipt,
  resolveTxContext,
} from "../utils/txContext";

export default defineHelper<Receipts>({
  name: "tx.fee",
  batchable: false,
  experimental: true,
  description:
    "Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains).",
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
    return computeFee(requireReceipt(ctx)).toString();
  },
});
