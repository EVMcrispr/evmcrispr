import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileExpr,
  constBigInt,
  encodeOperator,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
  opsCall,
} from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { resolveBlock } from "../utils/blockContext";

export default defineHelper<Receipts>({
  name: "block.hash",
  batchable: false,
  description:
    "Hash of a sealed block, addressed by number or tag (default: latest).",
  compileDescription:
    "BLOCKHASH semantics: the block number is required, only the previous 256 blocks are reachable, and anything outside them reads 0.",
  returnType: "bytes32",
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
    if (sealed.hash === null) {
      throw new ErrorException(
        `block ${block} is still pending and has no hash yet`,
      );
    }
    return sealed.hash;
  },
  compile: async (ctx, node): Promise<Operand> => {
    if (node.args.length === 0) {
      throw new ErrorException("@block.hash! expects a block number");
    }
    const n = await compileExpr(ctx, node.args, "num");
    if (n.cat === "Int") {
      throw new ErrorException("@block.hash! block number must be unsigned");
    }
    if (n.kind === "const") {
      return opsCall(
        ctx,
        encodeOperator("blockHash", [constBigInt(n)]),
        "Bytes32",
      );
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.blockHash, [
        materializeWord(ctx, n),
      ]),
      cat: "Bytes32",
    };
  },
});
