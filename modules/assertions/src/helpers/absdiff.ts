import { ErrorException } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "absdiff!",
  description:
    "Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality.",
  returnType: "number",
  args: [
    { name: "a", type: "any", description: "First numeric operand" },
    { name: "b", type: "any", description: "Second numeric operand" },
  ],
  compileAssert: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "absdiff!");
    if (operands.length !== 2) {
      throw new ErrorException("@absdiff! takes exactly two operands");
    }
    return arithCombine(ctx, "AbsDiff", operands[0], operands[1]);
  },
});
