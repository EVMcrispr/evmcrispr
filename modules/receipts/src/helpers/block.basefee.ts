import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.basefee",
  batchable: false,
  description:
    "The block base fee in wei: addressed by number or tag you read a sealed block off-chain (default: latest); as @block.basefee! you read the block being written at assertion time, e.g. to gate a batch on fee conditions.",
  returnType: "number",
  args: [
    {
      name: "block",
      type: ["number", "string"],
      optional: true,
      description: "Block number or tag (default: latest)",
    },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { block, chain }) {
    const sealed = await resolveBlock(module, block, chain);
    if (sealed.baseFeePerGas === null) {
      throw new ErrorException(
        `block ${sealed.number} predates EIP-1559 and carries no base fee`,
      );
    }
    return Num(sealed.baseFeePerGas);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.basefee! takes no arguments");
    return opsCall(ctx, encodeOperator("baseFee"), "Uint");
  },
});
