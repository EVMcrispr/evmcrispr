import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.prevrandao",
  batchable: false,
  description:
    "The RANDAO mix of a block, as a number: addressed by number or tag you read the mixHash field of a sealed block off-chain (default: latest; pre-merge blocks carry proof-of-work difficulty semantics in it); as @block.prevrandao! you read the block being written at assertion time.",
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
    // Post-merge headers seal the previous RANDAO mix in the mixHash
    // field (EIP-4399) — the exact value PREVRANDAO exposes on-chain.
    // Pre-merge blocks carry the proof-of-work mix digest there instead,
    // matching how the opcode reinterpreted DIFFICULTY.
    const sealed = await resolveBlock(module, block, chain);
    return Num(BigInt(sealed.mixHash));
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.prevrandao! takes no arguments");
    return opsCall(ctx, encodeOperator("prevRandao"), "Uint");
  },
});
