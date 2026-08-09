import { ErrorException } from "@evmcrispr/sdk";
import type { Operand } from "../lib/compiler";
import {
  compileExpr,
  constBigInt,
  materializeWord,
  opReadParam,
  opsCall,
} from "../lib/compiler";
import { encodeOperator, OP_SELECTORS } from "../lib/operators";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "blockhash!",
  description:
    "The hash of a block, read at assertion time (0 for the current block, the future, and blocks older than 256). Compose the number live, e.g. @blockhash!(@blocknumber! - 1).",
  returnType: "bytes32",
  args: [
    {
      name: "block",
      type: "number",
      rest: true,
      description: "Block number: a constant or an infix expression",
    },
  ],
  compileAssert: async (ctx, node): Promise<Operand> => {
    if (node.args.length === 0) {
      throw new ErrorException("@blockhash! expects a block number");
    }
    const n = await compileExpr(ctx, node.args, "num");
    if (n.cat === "Int") {
      throw new ErrorException("@blockhash! block number must be unsigned");
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
