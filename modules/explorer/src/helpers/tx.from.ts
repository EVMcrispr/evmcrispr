import { defineHelper } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import type Explorer from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.from",
  batchable: false,
  experimental: true,
  description: "Sender address of a transaction.",
  returnType: "address",
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
    return getAddress(ctx.tx.from);
  },
});
