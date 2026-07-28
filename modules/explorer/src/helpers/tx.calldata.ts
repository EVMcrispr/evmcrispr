import { defineHelper } from "@evmcrispr/sdk";
import type Explorer from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.calldata",
  batchable: false,
  experimental: true,
  description:
    "Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall.",
  returnType: "bytes",
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
    return ctx.tx.input;
  },
});
