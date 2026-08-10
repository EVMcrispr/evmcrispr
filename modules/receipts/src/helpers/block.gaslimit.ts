import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.gaslimit",
  batchable: false,
  description:
    "Gas limit of a sealed block, addressed by number or tag (default: latest).",
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
    return Num(sealed.gasLimit);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.gaslimit! takes no arguments");
    return opsCall(ctx, encodeOperator("gasLimit"), "Uint");
  },
});
