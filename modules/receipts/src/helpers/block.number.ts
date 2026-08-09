import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.number",
  batchable: false,
  description:
    "The block number: addressed by number or tag you read a sealed block off-chain (default: latest, so tags like finalized resolve to their current number); as @block.number! you read the block being written at assertion time.",
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
    if (sealed.number === null) {
      throw new ErrorException(
        `block ${block} is still pending and has no number yet`,
      );
    }
    return Num(sealed.number);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.number! takes no arguments");
    return opsCall(ctx, encodeOperator("blockNumber"), "Uint");
  },
});
