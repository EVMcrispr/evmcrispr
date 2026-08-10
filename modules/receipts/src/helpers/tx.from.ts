import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import { getAddress } from "viem";
import type Receipts from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Receipts>({
  name: "tx.from",
  batchable: false,
  description: "Sender of a transaction, addressed by hash.",
  compileDescription:
    "Reads the origin of the transaction being written (the ORIGIN opcode), and takes no arguments.",
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
