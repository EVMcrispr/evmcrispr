import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Operand } from "../lib/compiler";
import {
  compileExpr,
  constBigInt,
  materializeWord,
  opReadParam,
} from "../lib/compiler";
import { OP_SELECTORS } from "../lib/operators";
import { defineBangHelper } from "./_bang";

/** Floor integer square root (Newton, bigint). */
function isqrt(v: bigint): bigint {
  if (v < 2n) return v;
  let x0 = v;
  let x1 = (v >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + v / x1) >> 1n;
  }
  return x0;
}

export default defineBangHelper({
  name: "sqrt!",
  description:
    "Integer square root (floor) computed on-chain, the AMM invariant form, e.g. @sqrt!($pool::reserve0() * $pool::reserve1()).",
  returnType: "number",
  args: [
    {
      name: "expression",
      type: "number",
      rest: true,
      description: "Unsigned numeric expression to take the square root of",
    },
  ],
  compileAssert: async (ctx, node): Promise<Operand> => {
    if (node.args.length === 0) {
      throw new ErrorException("@sqrt! expects a numeric expression");
    }
    const o = await compileExpr(ctx, node.args, "num");
    if (o.cat === "Int" || (o.kind === "const" && constBigInt(o) < 0n)) {
      throw new ErrorException("@sqrt! needs an unsigned operand");
    }
    if (o.kind === "const") {
      return {
        kind: "const",
        cat: "Uint",
        value: Num.fromBigInt(isqrt(constBigInt(o))),
      };
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.sqrt, [materializeWord(ctx, o)]),
      cat: "Uint",
    };
  },
});
