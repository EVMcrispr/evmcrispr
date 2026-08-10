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

export default defineHelper<Receipts>({
  name: "tx.blobhash",
  description:
    "Versioned hash of a blob carried by the executing transaction, or 0 when the index is out of range.",
  returnType: "bytes32",
  args: [
    {
      name: "index",
      type: "number",
      rest: true,
      description: "Blob index: a constant or an infix expression",
    },
  ],
  compile: async (ctx, node): Promise<Operand> => {
    if (node.args.length === 0) {
      throw new ErrorException("@tx.blobhash! expects a blob index");
    }
    const n = await compileExpr(ctx, node.args, "num");
    if (n.cat === "Int") {
      throw new ErrorException("@tx.blobhash! index must be unsigned");
    }
    if (n.kind === "const") {
      return opsCall(
        ctx,
        encodeOperator("blobHash", [constBigInt(n)]),
        "Bytes32",
      );
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.blobHash, [materializeWord(ctx, n)]),
      cat: "Bytes32",
    };
  },
});
