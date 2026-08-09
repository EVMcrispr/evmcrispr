import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "absdiff",
  description:
    "Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality.",
  returnType: "number",
  args: [
    { name: "a", type: "number", description: "First numeric operand" },
    { name: "b", type: "number", description: "Second numeric operand" },
  ],
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "absdiff!");
    if (operands.length !== 2) {
      throw new ErrorException("@absdiff! takes exactly two operands");
    }
    return arithCombine(ctx, "AbsDiff", operands[0], operands[1]);
  },
});
