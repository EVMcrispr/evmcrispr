import { defineHelper } from "@evmcrispr/sdk";
import type Explorer from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.value",
  batchable: false,
  experimental: true,
  description: "Native value sent with a transaction, in wei.",
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
    return ctx.tx.value.toString();
  },
});
