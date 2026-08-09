import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.timestamp",
  batchable: false,
  description:
    "The block timestamp: addressed by number or tag you read a sealed block off-chain (default: latest); as @block.timestamp! you read the block being written at assertion time.",
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
    return Num(sealed.timestamp);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.timestamp! takes no arguments");
    return opsCall(ctx, encodeOperator("timestamp"), "Uint");
  },
});
