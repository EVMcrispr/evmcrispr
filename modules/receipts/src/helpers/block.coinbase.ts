import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import { getAddress } from "viem";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.coinbase",
  batchable: false,
  description:
    "Fee recipient address of a sealed block, addressed by number or tag (default: latest).",
  compileDescription: "Reads the block being written, and takes no arguments.",
  returnType: "address",
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
    return getAddress(sealed.miner);
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.coinbase! takes no arguments");
    return opsCall(ctx, encodeOperator("coinbase"), "Address");
  },
});
