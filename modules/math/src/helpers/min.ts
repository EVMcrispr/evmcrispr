import { defineHelper } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type MathModule from "..";
import { numericValues } from "../utils";

export default defineHelper<MathModule>({
  name: "min",
  description:
    "Minimum of two or more values: plain @min computes off-chain, @min! on-chain at execution time.",
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
  async run(_module, { values }) {
    const nums = numericValues(values, "min");
    return nums.reduce((acc, v) => (v.lt(acc) ? v : acc));
  },
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "min!");
    return operands.reduce((acc, o) => arithCombine(ctx, "Min", acc, o));
  },
});
