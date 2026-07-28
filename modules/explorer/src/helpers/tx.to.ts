import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import type Explorer from "..";
import { resolveTxContext } from "../utils/txContext";

export default defineHelper<Explorer>({
  name: "tx.to",
  batchable: false,
  experimental: true,
  description:
    "Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`).",
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
    if (ctx.tx.to === null) {
      const created = ctx.receipt?.contractAddress;
      throw new ErrorException(
        `transaction ${ctx.hash} is a contract creation — there is no \`to\`; the created contract is ${created ? getAddress(created) : "unknown"}`,
      );
    }
    return getAddress(ctx.tx.to);
  },
});
