import { defineHelper } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "max",
  description:
    "Maximum of two or more values, computed on-chain at assertion time.",
  returnType: "number",
  args: [
    {
      name: "values",
      type: "number",
      rest: true,
      optional: true,
      description: "Two or more numeric operands (or one array of them)",
    },
  ],
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "max!");
    return operands.reduce((acc, o) => arithCombine(ctx, "Max", acc, o));
  },
});
