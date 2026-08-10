import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

export default defineHelper<MathModule>({
  name: "absDiff",
  description: "Absolute difference |a - b|.",
  compileDescription:
    "Never underflows, so `@absDiff!(a b) <= d` is the composable approximate-equality.",
  returnType: "number",
  args: [
    { name: "a", type: "number", description: "First numeric operand" },
    { name: "b", type: "number", description: "Second numeric operand" },
  ],
  async run(_module, args) {
    const a = Num(args.a);
    const b = Num(args.b);
    return a.gte(b) ? a.sub(b) : b.sub(a);
  },
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "absDiff!");
    if (operands.length !== 2) {
      throw new ErrorException("@absDiff! takes exactly two operands");
    }
    return arithCombine(ctx, "AbsDiff", operands[0], operands[1]);
  },
});
