import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import { getAddress } from "viem";
import type Receipts from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Receipts>({
  name: "tx.from",
  batchable: false,
  description:
    "The sender of a transaction: addressed by hash you read the from field of a sealed receipt off-chain; as @tx.from! you read the origin of the transaction being written, on-chain at execution time (the ORIGIN opcode, no arguments).",
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
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException(
        "@tx.from! takes no arguments: it reads the origin of the transaction being written",
      );
    return opsCall(ctx, encodeOperator("origin"), "Address");
  },
});
