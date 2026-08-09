import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileExpr,
  constBigInt,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
} from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

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

export default defineHelper<MathModule>({
  name: "sqrt",
  description:
    "Integer square root (floor): plain @sqrt computes off-chain, @sqrt! on-chain, the AMM invariant form, e.g. @sqrt!($pool::reserve0() * $pool::reserve1()).",
  returnType: "number",
  args: [
    {
      name: "expression",
      type: "number",
      rest: true,
      description: "Unsigned numeric expression to take the square root of",
    },
  ],
  async run(_module, { expression }) {
    const values = Array.isArray(expression) ? expression : [];
    if (values.length !== 1) {
      throw new ErrorException("@sqrt expects a single numeric value");
    }
    const v = Num(values[0]);
    if (v.lt(Num.fromBigInt(0n))) {
      throw new ErrorException("@sqrt needs an unsigned operand");
    }
    return Num.fromBigInt(isqrt(v.toBigInt()));
  },
  compile: async (ctx, node): Promise<Operand> => {
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
