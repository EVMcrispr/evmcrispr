import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.baseFee",
  batchable: false,
  description:
    "Base fee in wei of a sealed block, addressed by number or tag (default: latest).",
  compileDescription: "Reads the block being written, and takes no arguments.",
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
      throw new ErrorException("@block.baseFee! takes no arguments");
    return opsCall(ctx, encodeOperator("baseFee"), "Uint");
  },
});
